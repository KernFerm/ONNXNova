import argparse
import inspect
import os
import sys
from pathlib import Path

import onnx
import torch


DEFAULT_HEIGHT = 640
DEFAULT_WIDTH = 640
DEFAULT_OPSET = 12


def log(message):
    print(message, flush=True)


def progress(stage_key, percent, message):
    print(f"PROGRESS_STAGE={stage_key}|{percent}|{message}", flush=True)


def fail(message, exit_code=1):
    print(f"ERROR: {message}", file=sys.stderr, flush=True)
    raise SystemExit(exit_code)


def validate_input_file(input_path):
    progress("validating", 15, "Validating input file")
    if not input_path.exists():
        fail(f"Input file does not exist: {input_path}")

    if not input_path.is_file():
        fail(f"Input path is not a file: {input_path}")

    if input_path.suffix.lower() != ".pt":
        fail("Input file must have a .pt extension.")


def ensure_output_directory(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    if not output_dir.exists() or not output_dir.is_dir():
        fail(f"Could not create output directory: {output_dir}")


def extract_model(loaded_object):
    if isinstance(loaded_object, torch.jit.ScriptModule):
        return loaded_object

    if isinstance(loaded_object, torch.nn.Module):
        return loaded_object

    if isinstance(loaded_object, dict):
        for key in ("model", "module", "net"):
            candidate = loaded_object.get(key)
            if isinstance(candidate, torch.nn.Module):
                return candidate

    fail(
        "The .pt file does not contain an exportable torch.nn.Module or TorchScript model. "
        "If your file is a checkpoint dictionary, load the model architecture and save the model itself first."
    )


def infer_input_channels(model):
    try:
        for parameter in model.parameters():
            if parameter.ndim >= 4 and parameter.shape[1] > 0:
                return int(parameter.shape[1])
    except Exception:
        pass
    return 3


def prepare_model_for_export(model, dynamic_axes_enabled):
    model.cpu()
    model.eval()

    for module in model.modules():
        if hasattr(module, "inplace"):
            try:
                module.inplace = False
            except Exception:
                pass

        if hasattr(module, "dynamic"):
            try:
                module.dynamic = bool(dynamic_axes_enabled)
            except Exception:
                pass

        if hasattr(module, "export"):
            try:
                module.export = True
            except Exception:
                pass

    return model


def try_ultralytics_load(input_path):
    try:
        from ultralytics import YOLO
    except Exception as error:
        return None, error

    try:
        yolo_model = YOLO(str(input_path))
        model = yolo_model.model
        model.eval()
        log("Loaded model with Ultralytics YOLO.")
        return model, None
    except Exception as error:
        return None, error


def torch_load_compat(input_path):
    kwargs = {"map_location": "cpu"}
    supports_weights_only = "weights_only" in inspect.signature(torch.load).parameters

    if supports_weights_only:
        kwargs["weights_only"] = False
        log(
            "PyTorch supports weights_only loading. Attempting a trusted full-model load "
            "with weights_only=False."
        )
    else:
        log("Attempting full-model load with torch.load.")

    return torch.load(str(input_path), **kwargs)


def load_model(input_path, allow_unsafe_load, dynamic_axes_enabled):
    log("Validating input file...")
    validate_input_file(input_path)

    progress("loading", 35, "Loading PyTorch model")
    log("Loading PyTorch model...")

    jit_error = None
    try:
        scripted = torch.jit.load(str(input_path), map_location="cpu")
        scripted.eval()
        log("Loaded model as TorchScript.")
        return scripted
    except Exception as error:
        jit_error = error

    if not allow_unsafe_load:
        fail(
            "This .pt file could not be loaded as TorchScript and may require trusted deserialization. "
            "Enable the 'I trust this model file' option only if you trust the source. "
            f"TorchScript error: {jit_error}"
        )

    ultralytics_model, ultralytics_error = try_ultralytics_load(input_path)
    if ultralytics_model is not None:
        return prepare_model_for_export(ultralytics_model, dynamic_axes_enabled)

    try:
        loaded = torch_load_compat(input_path)
        model = extract_model(loaded)
        model = prepare_model_for_export(model, dynamic_axes_enabled)
        log("Loaded model with torch.load.")
        return model
    except Exception as error:
        ultralytics_hint = ""
        if ultralytics_error is not None:
            ultralytics_hint = (
                " Ultralytics load also failed. "
                "If this is a newer YOLO model, install Ultralytics in the same Python environment. "
                f"Ultralytics error: {ultralytics_error}."
            )

        legacy_yolov5_hint = ""
        combined_error_text = f"{jit_error} {error} {ultralytics_error}".lower()
        if "yolov5" in combined_error_text or "no module named 'models'" in combined_error_text:
            legacy_yolov5_hint = (
                " Legacy YOLOv5 checkpoints are not supported in this release of ONNX Nova. "
                "Please export the model from a supported modern workflow or convert it using a dedicated YOLOv5 environment first."
            )

        fail(
            "Failed to load the .pt model. "
            f"TorchScript error: {jit_error}. "
            f"torch.load error: {error}."
            f"{ultralytics_hint}"
            f"{legacy_yolov5_hint}"
        )


def export_to_onnx(model, input_path, output_dir, output_name, input_height, input_width, opset_version, dynamic_axes_enabled):
    onnx_path = output_dir / output_name
    input_channels = infer_input_channels(model)

    progress("exporting", 70, "Exporting model to ONNX")
    log(f"Preparing dummy input with shape [1, {input_channels}, {input_height}, {input_width}]...")
    dummy_input = torch.randn(1, input_channels, input_height, input_width, device="cpu")

    log("Starting ONNX export...")
    log(f"Using opset version: {opset_version}")
    log(f"Dynamic axes: {'enabled' if dynamic_axes_enabled else 'disabled'}")

    dynamic_axes = (
        {
            "images": {0: "batch", 2: "height", 3: "width"},
            "output": {0: "batch"},
        }
        if dynamic_axes_enabled
        else None
    )

    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=["images"],
        output_names=["output"],
        dynamic_axes=dynamic_axes,
    )

    if not onnx_path.exists():
        fail(f"ONNX export did not create an output file: {onnx_path}")

    progress("verifying", 90, "Validating exported ONNX model")
    log("Validating exported ONNX model...")
    exported_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(exported_model)

    log("ONNX export completed.")
    log(f"OUTPUT_FILE={onnx_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Convert a PyTorch .pt file to ONNX.")
    parser.add_argument("--input", required=True, help="Path to the .pt file")
    parser.add_argument("--output-dir", required=True, help="Folder to save the .onnx file")
    parser.add_argument("--output-name", required=True, help="Output ONNX filename")
    parser.add_argument("--input-height", type=int, default=DEFAULT_HEIGHT, help="Input tensor height")
    parser.add_argument("--input-width", type=int, default=DEFAULT_WIDTH, help="Input tensor width")
    parser.add_argument("--opset-version", type=int, default=DEFAULT_OPSET, help="ONNX opset version")
    parser.add_argument("--dynamic-axes", default="True", help="Enable dynamic axes")
    parser.add_argument("--allow-unsafe-load", default="False", help="Allow trusted full-model load")
    return parser.parse_args()


def as_bool(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def main():
    args = parse_args()
    input_path = Path(os.path.abspath(args.input)).resolve()
    output_dir = Path(os.path.abspath(args.output_dir)).resolve()
    output_name = args.output_name if args.output_name.lower().endswith(".onnx") else f"{args.output_name}.onnx"
    dynamic_axes_enabled = as_bool(args.dynamic_axes)
    allow_unsafe_load = as_bool(args.allow_unsafe_load)

    log("Checking output directory...")
    ensure_output_directory(output_dir)

    model = load_model(input_path, allow_unsafe_load, dynamic_axes_enabled)
    export_to_onnx(
        model,
        input_path,
        output_dir,
        output_name,
        args.input_height,
        args.input_width,
        args.opset_version,
        dynamic_axes_enabled,
    )
    progress("completed", 100, "Conversion finished successfully")
    log("Conversion finished successfully.")


if __name__ == "__main__":
    main()
