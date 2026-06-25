# ONNX Nova EXE Release

Current release: `0.0.80`

## What This File Is

This release package is the Windows `.exe` installer for **ONNX Nova**.

It is meant for end users who want to install and use the desktop app without setting up the project manually.

## Included In This Release

- ONNX Nova desktop application
- Guided Windows installer
- License agreement during setup
- Desktop shortcut creation
- Built-in dependency setup launcher
- Support for CPU, NVIDIA, AMD, and dual-GPU systems
- Support for modern Ultralytics model workflows
- Dependency security updates for the packaged release toolchain

## Before Installing

Please keep these points in mind:

- This release is for **Windows x64**
- Python `3.11.9` is required for model conversion
- NVIDIA users may need CUDA `11.8`
- AMD users use the DirectML backend path
- Some `.pt` models require trusted deserialization, so only use model files you trust

## Install Steps

1. Run the ONNX Nova installer `.exe`
2. Accept the license agreement
3. Finish the installation
4. Launch ONNX Nova
5. If prompted, run the dependency setup

## Dependency Setup Behavior

The included setup flow can:

- detect Python `3.11.9`
- skip Python if it is already installed correctly
- download Python if it is missing
- remind the user to enable `Add Python to PATH`
- detect NVIDIA or AMD hardware
- prepare the correct backend package set
- skip software that is already installed correctly

## What The EXE Is For

This release helps users:

- load trusted `.pt` model files
- review model details
- choose output settings
- convert models to `.onnx`
- monitor logs and progress from inside the desktop app

## Notes

- Newer Ultralytics models use the supported loader path in this release
- This release includes dependency security updates and refreshed packaged build dependencies
- If conversion fails, check the in-app log area first

## Output

Successful conversion creates an `.onnx` file in the chosen output folder.

## Support

If something is not working:

1. Open ONNX Nova
2. Check the `Python Status` section
3. Run `Install Dependencies`
4. Try the conversion again
5. Copy the log output if you need to report the error
