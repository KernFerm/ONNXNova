# Changelog

All notable changes to `ONNX Nova` should be documented in this file.

## [0.0.64] - 2026-06-04

### Added

- legacy YOLOv5 compatibility support alongside newer Ultralytics model loading
- fallback YOLOv5 dependency wiring in backend requirements and dependency installer flow

### Changed

- synced AMD DirectML package expectations across requirements, app status checks, and installer setup
- updated versioned docs to the current `0.0.64` release

### Fixed

- improved packaged splash asset inclusion for installed builds
- strengthened packaged Python detection so installed app builds can find Python more reliably
- auto-selected the output folder from the chosen model path to make conversion flow easier

## [0.0.50] - 2026-06-04

### Added

- branded ONNX Nova splash screen with animated loading visuals
- Windows `.ico` wiring for the packaged app, installer, uninstaller, and header icon
- desktop shortcut creation script triggered during installation
- updated docs set inside the `docs` folder for the current ONNX Nova release

### Changed

- increased splash screen display timing for a stronger launch feel
- updated build and runtime icon usage to the dedicated ONNX Nova Windows icon set
- improved export settings UX with input size presets and clearer opset guidance

### Fixed

- improved readability for preset dropdown options
- strengthened warning styling for trust-sensitive and opset-related UI text

## [0.0.30] - 2026-06-04

### Added

- renamed the product to `ONNX Nova`
- futuristic neon desktop UI theme
- native app menu with `File`, `About`, and `Education`
- custom About and How To Use modal windows
- model info panel with filename, size, modified date, and guessed type
- drag and drop `.pt` model support
- recent model and output folder history
- output filename editing
- progress bar and stage chips
- copy log and clear log controls
- Python status panel with backend-aware package checks
- dependency installer launch from the app
- output folder shortcut after successful export
- input size presets for `640 x 640`, `320 x 320`, and experimental custom sizing
- PowerShell installer flow for Python and backend dependencies
- dual-GPU backend selection support for NVIDIA and AMD systems
- forced desktop shortcut creation during install
- Windows icon wiring for packaged builds and installer assets

### Changed

- updated the app branding, installer name, and visible UI labels to `ONNX Nova`
- improved README wording for end users and installer-based setup
- made Python status checks backend-aware so irrelevant AMD/NVIDIA packages are not shown
- corrected installer packaging so PowerShell helper scripts are included in builds
- aligned NSIS install behavior with per-machine installation
- improved export settings guidance, including recommended opset messaging

### Fixed

- fixed Python version detection issues in the app status check
- fixed embedded Python status probe formatting and parsing problems
- fixed drag-and-drop path resolution for local files
- fixed readability issues in the input size preset dropdown
- fixed PowerShell desktop shortcut script parsing

## [0.0.10] - 2026-06-04

### Added

- protected build scripts for prepare, pack, and dist flows
- GNU license file for installer use

## [0.0.5] - 2026-06-04

### Added

- initial Electron desktop app structure
- Python backend export flow for `.pt` to `.onnx`
- secure preload bridge and renderer/main separation
