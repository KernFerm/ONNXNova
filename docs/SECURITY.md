# Security Policy

Current documented release: `0.0.80`

## Supported Scope

This project is `ONNX Nova`, a Windows desktop application for exporting trusted PyTorch `.pt` models to ONNX `.onnx`.

Security reports are especially helpful for issues involving:

- unsafe file handling
- command injection
- installer or update flow abuse
- privilege or path escalation
- Python dependency installation flow weaknesses
- model loading trust boundaries
- local data exposure

## Important Safety Note

`ONNX Nova` can work with PyTorch `.pt` files that may deserialize Python objects during export.

Because of that:

- only use model files from sources you trust
- do not bypass trust warnings for unknown files
- treat third-party `.pt` files as potentially dangerous

This behavior is part of the PyTorch ecosystem and is an important security boundary for this app.

## Reporting a Vulnerability

If you discover a security issue, please report it privately before sharing it publicly.

Include:

- a short description of the issue
- steps to reproduce it
- what version of `ONNX Nova` you tested
- whether the issue affects the installer, app UI, PowerShell scripts, or backend Python export
- screenshots or logs if helpful

If a proof of concept is needed, keep it minimal and safe.

## What To Avoid In Public Reports

Please do not publicly post:

- weaponized exploit code
- malicious `.pt` files
- secrets, tokens, or personal data
- system-specific private paths if they are not necessary

## Security Design Notes

Current hardening in the project includes:

- `contextIsolation: true`
- `nodeIntegration: false`
- preload bridge instead of direct renderer Node access
- normalized and validated file paths
- Python launched without shell command interpolation
- guided trust confirmation before unsafe model loading
- dependency setup based on official download sources
- dependency security updates applied to the packaged app toolchain

## Response Goal

Best effort goals:

- acknowledge report receipt quickly
- reproduce the issue
- fix or mitigate confirmed security problems
- document important user-facing security changes in `CHANGELOG.md`

## User Best Practices

To stay safer while using `ONNX Nova`:

- only open trusted `.pt` files
- keep Windows and Python updated
- install dependencies using the bundled setup flow
- avoid running unknown modified builds of the app
- review logs and warnings before retrying exports
