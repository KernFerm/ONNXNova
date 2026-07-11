# ONNX Nova

🎯 ONNX Nova is a futuristic desktop export utility for preparing trusted PyTorch `.pt` models for ONNX `.onnx` workflows.

It is built to feel guided, polished, and powerful, while still being easy for everyday users to operate.

Current documented release: `0.0.90`

## ✨ What ONNX Nova Does

- Converts trusted `.pt` model files into `.onnx`
- Supports modern Ultralytics model workflows
- Guides the user through model selection, output setup, and export settings
- Shows live progress, status, and readable log messages
- Detects Python, GPU support, and required backend packages
- Helps install missing software when needed
- Supports CPU, NVIDIA, AMD, and dual-GPU systems
- Includes a branded splash screen and Windows desktop shortcut setup
- Includes updated dependency security maintenance in the current release

## 💾 Installing ONNX Nova

1. Download the `ONNX Nova` installer `.exe`
2. Run the installer
3. Read and accept the license agreement
4. Finish the installation steps

After installation, the app installer may ask whether you want to run the dependency setup right away.

That setup helps prepare your system for model export.

## 🧠 What The Setup Checks

ONNX Nova can check for:

- Python `3.11.9`
- NVIDIA CUDA `11.8` on NVIDIA systems
- AMD DirectML support on AMD systems
- The exact Python package versions needed for your backend

## ✅ If Python Is Already Installed

If Python `3.11.9` is already detected, setup skips the download and moves on.

## ⬇️ If Python Is Missing

ONNX Nova will:

- Download Python `3.11.9` from the official Python website
- Open the installer for the user
- Remind the user to check `Add Python to PATH`
- Continue with the rest of setup after Python is installed

## ✅ If NVIDIA CUDA 11.8 Is Already Installed

The setup skips CUDA installation.

## ⬇️ If NVIDIA CUDA 11.8 Is Missing

ONNX Nova will:

- Download the official NVIDIA CUDA `11.8` installer
- Open the installer for the user
- Wait for the user to finish the installation
- Continue with the correct Python package setup

## 🟠 If The Computer Uses AMD

The setup uses the AMD DirectML backend path and installs the matching Python package set.

## 🖥️ If The Computer Has Both NVIDIA And AMD GPUs

That is supported.

ONNX Nova will detect both and ask which backend the user wants to prepare:

- NVIDIA CUDA 11.8
- AMD DirectML
- CPU only

## 🚀 First-Time Setup

When ONNX Nova opens for the first time:

1. Check the `Python Status` panel
2. If anything is missing, click `Install Dependencies`
3. Follow the prompts shown on screen
4. Return to the app after setup finishes

## 🔄 How To Export a Model

1. Open ONNX Nova
2. Click `Select .pt File`
3. Choose the model file
4. Click `Select Output Folder`
5. Choose where the ONNX file should be saved
6. Change the output name or export settings if needed
7. Confirm that you trust the model file
8. Click `Convert`
9. Watch the progress bar and log area
10. Open the output folder after success

You can also drag and drop a `.pt` model into the app window. 🖱️

## ⚙️ Default Export Settings

If you leave the defaults as-is, ONNX Nova uses:

- Input size: `640 x 640`
- Opset version: `12`
- Dynamic axes: `On`

## 🛠️ If Something Is Missing

Use the `Install Dependencies` button inside the app.

That setup is designed to:

- Detect what is already installed
- Skip software you already have
- Download only what is missing
- Install the correct versions for your hardware path
- Keep the expected backend dependency set aligned with the current secured release

## ❗ Trust Warning

Some `.pt` files can load Python objects during export.

Only continue with model files you trust. 🔐

If ONNX Nova asks you to confirm trust before export, that is expected behavior.

## 🧩 Troubleshooting

### The app says Python was not detected

Open ONNX Nova and click `Install Dependencies`.

If Python is missing, the setup can download `Python 3.11.9` for you.

### The app says packages are missing

Use `Install Dependencies` to install or repair the exact package versions the app expects.

### My model will not export

Possible reasons include:

- The `.pt` file is not a full exportable model
- The model depends on extra packages
- The model came from a custom codebase
- The model expects a different input shape
- The model may depend on an older or custom training codebase that is not supported by the current loader

### The app says the file must be `.pt`

Make sure the selected file ends in `.pt`.

### I have both NVIDIA and AMD GPUs

That is supported. ONNX Nova will ask which backend you want to prepare during setup.

## 💡 Helpful Tips

- Keep your model files in an easy-to-find folder
- Use clean output names
- Check the log area if an export fails
- Use `Copy Log` if you need to share the error
- Use `Open Output Folder` after a successful export

## 🆘 Need Help?

If something is not working:

1. Open ONNX Nova
2. Check the `Python Status` panel
3. Run `Install Dependencies`
4. Try again
5. Read the log message shown by the app

Most setup and export problems can be solved from inside ONNX Nova without extra tools. 👍
