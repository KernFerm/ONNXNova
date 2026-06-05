@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ONNX Nova Dependency Setup
color 0B
cls
echo ============================================================
echo                 ONNX Nova Dependency Setup
echo ============================================================
echo.
echo This window will stay open so you can see each install step.
echo.

set "PAYLOAD_MARKER=:__ONNX_NOVA_POWERSHELL_PAYLOAD__"
set "TEMP_PS1=%TEMP%\onnx-nova-install-%RANDOM%-%RANDOM%.ps1"
set "ONNX_NOVA_TOOLS_DIR=%~dp0"
for %%I in ("%~dp0..") do set "ONNX_NOVA_APP_ROOT=%%~fI"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$source = Get-Content -LiteralPath '%~f0';" ^
  "$marker = '%PAYLOAD_MARKER%';" ^
  "$markerIndex = [Array]::IndexOf($source, $marker);" ^
  "if ($markerIndex -lt 0) { exit 2 };" ^
  "$payload = $source[($markerIndex + 1)..($source.Length - 1)];" ^
  "[System.IO.File]::WriteAllLines('%TEMP_PS1%', $payload)" >nul

if errorlevel 1 (
  echo [ERROR] Could not extract the embedded PowerShell installer payload.
  echo.
  pause
  exit /b 1
)

if not exist "%TEMP_PS1%" (
  echo [ERROR] Failed to extract the embedded installer payload.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%TEMP_PS1%"
set "EXIT_CODE=%ERRORLEVEL%"

del "%TEMP_PS1%" >nul 2>&1

echo.
if "%EXIT_CODE%"=="0" (
  echo Dependency setup finished successfully.
) else (
  echo Dependency setup ended with exit code %EXIT_CODE%.
)
echo.
pause
endlocal & exit /b %EXIT_CODE%

:__ONNX_NOVA_POWERSHELL_PAYLOAD__
param(
    [ValidateSet("auto", "cpu", "nvidia", "amd")]
    [string]$Backend = "auto"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.SecurityProtocolType]::Tls12 -bor `
    [Net.SecurityProtocolType]::Tls11 -bor `
    [Net.SecurityProtocolType]::Tls

$RequiredPythonVersion = "3.11.9"
$RequiredCudaVersion = "11.8"
$RequiredDirectMlPackage = "0.2.5.dev240914"
$CudaInstallerUrl = "https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_522.06_windows.exe"
$ProjectRoot = if ($env:ONNX_NOVA_APP_ROOT) { $env:ONNX_NOVA_APP_ROOT } else { Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$DownloadDir = Join-Path $env:TEMP "onnx-nova-bootstrap"
$ScriptRoot = if ($env:ONNX_NOVA_TOOLS_DIR) { $env:ONNX_NOVA_TOOLS_DIR } else { $PSScriptRoot }

$BackendProfiles = @{
    cpu = [ordered]@{
        Label = "CPU"
        Packages = [ordered]@{
            torch = "2.7.1"
            torchaudio = "2.7.1"
            torchvision = "0.22.1"
            ultralytics = "8.4.60"
            onnx = "1.19.1"
        }
    }
    nvidia = [ordered]@{
        Label = "NVIDIA CUDA 11.8"
        Packages = [ordered]@{
            torch = "2.7.1+cu118"
            torchaudio = "2.7.1+cu118"
            torchvision = "0.22.1+cu118"
            ultralytics = "8.4.60"
            onnx = "1.19.1"
        }
    }
    amd = [ordered]@{
        Label = "AMD DirectML"
        Packages = [ordered]@{
            torch = "2.4.1"
            torchaudio = "2.4.1"
            torchvision = "0.19.1"
            torch_directml = $RequiredDirectMlPackage
            ultralytics = "8.4.60"
            onnx = "1.19.1"
            numpy = "1.26.4"
        }
    }
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnMessage {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-StepBanner {
    param([string]$Title)

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host " $Title" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Write-DetectionBanner {
    param(
        [string]$Label,
        [string]$Mode = "AUTO"
    )

    Write-Host ""
    Write-Host "############################################################" -ForegroundColor DarkYellow
    Write-Host " $Mode DETECTED BACKEND: $Label" -ForegroundColor Black -BackgroundColor Yellow
    Write-Host "############################################################" -ForegroundColor DarkYellow
}

function Wait-BeforeExit {
    Write-Host ""
    Read-Host "Setup finished. Press Enter to close this window"
}

function Get-SetupDirectories {
    $directories = New-Object System.Collections.Generic.List[string]

    foreach ($candidate in @(
        (Join-Path $ProjectRoot "setup"),
        (Join-Path $ScriptRoot "setup"),
        (Join-Path (Get-Location).Path "setup")
    )) {
        if ($candidate -and (Test-Path $candidate) -and -not $directories.Contains($candidate)) {
            [void]$directories.Add($candidate)
        }
    }

    return $directories
}

function Find-LocalInstaller {
    param([string]$FileName)

    foreach ($directory in Get-SetupDirectories) {
        $candidate = Join-Path $directory $FileName
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Assert-WindowsEnvironment {
    $platform = [Environment]::OSVersion.Platform
    if ($platform -ne [PlatformID]::Win32NT) {
        throw "This installer script is only supported on Windows."
    }

    if ($PSVersionTable.PSVersion.Major -lt 5 -or (
        $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -lt 1
    )) {
        throw "PowerShell 5.1 or newer is required to run this installer script."
    }
}

function Assert-SupportedArchitecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    if ($arch -ne "X64") {
        throw "This installer currently supports Windows x64 only. Detected architecture: $arch."
    }
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $combined = @($machinePath, $userPath) -join ";"
    $combined = ($combined -split ";" | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique) -join ";"
    $env:Path = $combined
}

function Ensure-DownloadDirectory {
    if (-not (Test-Path $DownloadDir)) {
        New-Item -ItemType Directory -Path $DownloadDir | Out-Null
    }
}

function Invoke-VerifiedDownload {
    param(
        [string]$Url,
        [string]$ExpectedSignerSubstring
    )

    Ensure-DownloadDirectory
    $fileName = Split-Path $Url -Leaf
    $outputPath = Join-Path $DownloadDir $fileName

    Invoke-WebRequest -Uri $Url -OutFile $outputPath

    $signature = Get-AuthenticodeSignature -FilePath $outputPath
    if ($signature.Status -ne "Valid") {
        throw "Downloaded installer signature is not valid. Status: $($signature.Status)"
    }

    if ($signature.SignerCertificate.Subject -notlike "*$ExpectedSignerSubstring*") {
        throw "Downloaded installer was not signed by the expected publisher: $ExpectedSignerSubstring"
    }

    return $outputPath
}

function Get-GpuVendors {
    $vendors = [ordered]@{
        HasNvidia = $false
        HasAmd = $false
        HasIntel = $false
    }

    try {
        $controllers = Get-CimInstance Win32_VideoController -ErrorAction Stop
        foreach ($controller in $controllers) {
            $name = [string]$controller.Name
            $compat = [string]$controller.AdapterCompatibility
            if ($name -match "NVIDIA" -or $compat -match "NVIDIA") {
                $vendors.HasNvidia = $true
            }
            if ($name -match "AMD|Radeon" -or $compat -match "AMD|ATI") {
                $vendors.HasAmd = $true
            }
            if ($name -match "Intel" -or $compat -match "Intel") {
                $vendors.HasIntel = $true
            }
        }
    } catch {
        Write-WarnMessage "Could not detect GPU hardware automatically."
    }

    return $vendors
}

function Get-PythonInstallerUrl {
    return "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
}

function Add-CandidatePath {
    param(
        [System.Collections.Generic.List[string]]$Candidates,
        [string]$PathValue
    )

    if (-not $PathValue) {
        return
    }

    $expandedPath = [Environment]::ExpandEnvironmentVariables($PathValue)
    if ((Test-Path $expandedPath) -and -not $Candidates.Contains($expandedPath)) {
        [void]$Candidates.Add($expandedPath)
    }
}

function Get-PythonRegistryInstallPaths {
    $paths = New-Object System.Collections.Generic.List[string]
    $registryRoots = @(
        "HKCU:\Software\Python\PythonCore",
        "HKLM:\Software\Python\PythonCore",
        "HKLM:\Software\WOW6432Node\Python\PythonCore"
    )

    foreach ($root in $registryRoots) {
        if (-not (Test-Path $root)) {
            continue
        }

        foreach ($versionKey in Get-ChildItem -Path $root -ErrorAction SilentlyContinue) {
            if ($versionKey.PSChildName -notlike "3.11*") {
                continue
            }

            $installPathKey = Join-Path $versionKey.PSPath "InstallPath"
            if (-not (Test-Path $installPathKey)) {
                continue
            }

            $installPath = (Get-ItemProperty -Path $installPathKey -ErrorAction SilentlyContinue)."(default)"
            if (-not $installPath) {
                $installPath = (Get-ItemProperty -Path $installPathKey -ErrorAction SilentlyContinue).InstallPath
            }

            if ($installPath) {
                Add-CandidatePath -Candidates $paths -PathValue (Join-Path $installPath "python.exe")
            }

            $executablePath = (Get-ItemProperty -Path $installPathKey -ErrorAction SilentlyContinue).ExecutablePath
            Add-CandidatePath -Candidates $paths -PathValue $executablePath
        }
    }

    return $paths
}

function Get-PythonCandidates {
    $candidates = New-Object System.Collections.Generic.List[string]

    foreach ($path in @(
        (Join-Path $env:LocalAppData "Programs\Python\Python311\python.exe"),
        (Join-Path $env:ProgramFiles "Python311\python.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Python311\python.exe")
    ) | Where-Object { $_ }) {
        Add-CandidatePath -Candidates $candidates -PathValue $path
    }

    foreach ($path in Get-PythonRegistryInstallPaths) {
        Add-CandidatePath -Candidates $candidates -PathValue $path
    }

    foreach ($command in @("py", "python", "python3")) {
        $resolved = Get-Command $command -ErrorAction SilentlyContinue
        if ($resolved) {
            Add-CandidatePath -Candidates $candidates -PathValue $resolved.Source
        }
    }

    return $candidates
}

function Test-PythonVersion {
    param(
        [string]$PythonCommand,
        [string]$ExpectedVersion
    )

    $code = "import platform, sys; sys.stdout.write(platform.python_version())"
    $output = & $PythonCommand -c $code 2>$null
    return $LASTEXITCODE -eq 0 -and $output -eq $ExpectedVersion
}

function Get-MatchingPython {
    param([string]$ExpectedVersion)

    foreach ($candidate in Get-PythonCandidates) {
        if (Test-PythonVersion -PythonCommand $candidate -ExpectedVersion $ExpectedVersion) {
            return $candidate
        }
    }

    return $null
}

function Download-PythonInstaller {
    $localInstaller = Find-LocalInstaller -FileName "python-3.11.9-amd64.exe"
    if ($localInstaller) {
        Write-Info "Using local Python installer from $localInstaller"
        return $localInstaller
    }

    $url = Get-PythonInstallerUrl
    Write-Info "Downloading Python $RequiredPythonVersion from $url"
    $installerPath = Invoke-VerifiedDownload -Url $url -ExpectedSignerSubstring "Python Software Foundation"
    Write-Success "Downloaded and verified the Python installer signature."
    return $installerPath
}

function Prompt-ForPythonInstall {
    param([string]$InstallerPath)

    Write-Host ""
    Write-WarnMessage "The official Python installer is about to open."
    Write-WarnMessage "On the first installer screen, make sure you CHECK 'Add Python to PATH' before continuing."
    Write-WarnMessage "Then complete the Python 3.11.9 installation and return here."
    Write-Host ""
    Read-Host "Press Enter to open the installer"

    Start-Process -FilePath $InstallerPath -Wait
}

function Ensure-PythonInstalled {
    $python = Get-MatchingPython -ExpectedVersion $RequiredPythonVersion
    if ($python) {
        Write-Success "Python $RequiredPythonVersion is already available at $python"
        return $python
    }

    $installerPath = Download-PythonInstaller
    Prompt-ForPythonInstall -InstallerPath $installerPath
    Refresh-ProcessPath

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        $python = Get-MatchingPython -ExpectedVersion $RequiredPythonVersion
        if ($python) {
            Write-Success "Detected Python $RequiredPythonVersion after installation."
            return $python
        }

        if ($attempt -lt 20) {
            Write-Info "Waiting for Python $RequiredPythonVersion to become available... attempt $attempt of 20"
            Start-Sleep -Seconds 3
            Refresh-ProcessPath
        }
    }

    throw "Python $RequiredPythonVersion was not detected after the installer closed. Re-run this script after confirming Python was installed and 'Add Python to PATH' was selected."
}

function Test-CudaNvccVersion {
    param([string]$NvccPath)

    if (-not (Test-Path $NvccPath)) {
        return $false
    }

    $output = & $NvccPath --version 2>$null
    return $LASTEXITCODE -eq 0 -and ($output -match "release 11\.8")
}

function Get-CudaRegistryInstallPaths {
    $paths = New-Object System.Collections.Generic.List[string]
    $registryRoots = @(
        "HKLM:\SOFTWARE\NVIDIA Corporation\GPU Computing Toolkit\CUDA",
        "HKLM:\SOFTWARE\WOW6432Node\NVIDIA Corporation\GPU Computing Toolkit\CUDA"
    )

    foreach ($root in $registryRoots) {
        $versionKey = Join-Path $root "v11.8"
        if (-not (Test-Path $versionKey)) {
            continue
        }

        $properties = Get-ItemProperty -Path $versionKey -ErrorAction SilentlyContinue
        foreach ($candidate in @($properties.InstallDir, $properties.InstallationPath, $properties.Path)) {
            if ($candidate -and (Test-Path $candidate) -and -not $paths.Contains($candidate)) {
                [void]$paths.Add($candidate)
            }
        }
    }

    return $paths
}

function Get-CudaInstallCandidates {
    $candidates = New-Object System.Collections.Generic.List[string]

    foreach ($candidate in @(
        [Environment]::GetEnvironmentVariable("CUDA_PATH_V11_8", "Machine"),
        [Environment]::GetEnvironmentVariable("CUDA_PATH_V11_8", "User"),
        [Environment]::GetEnvironmentVariable("CUDA_PATH", "Machine"),
        [Environment]::GetEnvironmentVariable("CUDA_PATH", "User"),
        (Join-Path $env:ProgramFiles "NVIDIA GPU Computing Toolkit\CUDA\v11.8")
    )) {
        if ($candidate -and (Test-Path $candidate) -and -not $candidates.Contains($candidate)) {
            [void]$candidates.Add($candidate)
        }
    }

    foreach ($candidate in Get-CudaRegistryInstallPaths) {
        if (-not $candidates.Contains($candidate)) {
            [void]$candidates.Add($candidate)
        }
    }

    return $candidates
}

function Get-MatchingCudaInstall {
    foreach ($candidate in Get-CudaInstallCandidates) {
        $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
        $nvccPath = Join-Path $expanded "bin\nvcc.exe"
        if (Test-CudaNvccVersion -NvccPath $nvccPath) {
            return $expanded
        }
    }

    $nvccCommand = Get-Command nvcc -ErrorAction SilentlyContinue
    if ($nvccCommand) {
        $resolvedNvcc = $nvccCommand.Source
        if (Test-CudaNvccVersion -NvccPath $resolvedNvcc) {
            return Split-Path -Parent (Split-Path -Parent $resolvedNvcc)
        }
    }

    return $null
}

function Download-CudaInstaller {
    $localInstaller = Find-LocalInstaller -FileName "cuda_11.8.0_522.06_windows.exe"
    if ($localInstaller) {
        Write-Info "Using local CUDA installer from $localInstaller"
        return $localInstaller
    }

    Write-Info "Downloading CUDA $RequiredCudaVersion from NVIDIA..."
    $installerPath = Invoke-VerifiedDownload -Url $CudaInstallerUrl -ExpectedSignerSubstring "NVIDIA"
    Write-Success "Downloaded and verified the CUDA installer signature."
    return $installerPath
}

function Prompt-ForCudaInstall {
    param([string]$InstallerPath)

    Write-Host ""
    Write-WarnMessage "The official NVIDIA CUDA $RequiredCudaVersion installer is about to open."
    Write-WarnMessage "Follow the installer prompts to complete the CUDA 11.8 installation, then return here."
    Write-Host ""
    Read-Host "Press Enter to open the CUDA installer"

    Start-Process -FilePath $InstallerPath -Wait
}

function Ensure-CudaInstalled {
    $cudaPath = Get-MatchingCudaInstall
    if ($cudaPath) {
        Write-Success "CUDA $RequiredCudaVersion is already available at $cudaPath"
        return $cudaPath
    }

    $installerPath = Download-CudaInstaller
    Prompt-ForCudaInstall -InstallerPath $installerPath
    Refresh-ProcessPath

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $cudaPath = Get-MatchingCudaInstall
        if ($cudaPath) {
            Write-Success "Detected CUDA $RequiredCudaVersion after installation."
            return $cudaPath
        }

        if ($attempt -lt 30) {
            Write-Info "Waiting for CUDA $RequiredCudaVersion to become available... attempt $attempt of 30"
            Start-Sleep -Seconds 4
            Refresh-ProcessPath
        }
    }

    throw "CUDA $RequiredCudaVersion was not detected after the installer closed. Re-run this script after confirming the NVIDIA CUDA 11.8 installation completed successfully."
}

function Select-Backend {
    param([string]$RequestedBackend)

    $gpu = Get-GpuVendors

    if ($RequestedBackend -ne "auto") {
        Write-Info "Manual backend override selected: $($BackendProfiles[$RequestedBackend].Label)"
        Write-DetectionBanner -Label $BackendProfiles[$RequestedBackend].Label -Mode "MANUAL"
        return $RequestedBackend
    }

    if ($gpu.HasNvidia -and $gpu.HasAmd) {
        Write-Info "Detected both NVIDIA and AMD GPU hardware on this system."
        Write-Host ""
        Write-Host "Choose which backend to install for this computer:"
        Write-Host "  1. NVIDIA CUDA 11.8 (recommended for NVIDIA workflows)"
        Write-Host "  2. AMD DirectML"
        Write-Host "  3. CPU only"
        Write-Host ""

        $choice = Read-Host "Enter 1, 2, or 3"
        switch ($choice) {
            "2" {
                Write-Info "Dual-GPU system detected. AMD DirectML backend selected."
                Write-DetectionBanner -Label $BackendProfiles["amd"].Label -Mode "AUTO"
                return "amd"
            }
            "3" {
                Write-Info "Dual-GPU system detected. CPU backend selected."
                Write-DetectionBanner -Label $BackendProfiles["cpu"].Label -Mode "AUTO"
                return "cpu"
            }
            default {
                Write-Info "Dual-GPU system detected. NVIDIA CUDA 11.8 backend selected."
                Write-DetectionBanner -Label $BackendProfiles["nvidia"].Label -Mode "AUTO"
                return "nvidia"
            }
        }
    }

    if ($gpu.HasNvidia) {
        Write-Info "Detected NVIDIA GPU hardware."
        Write-DetectionBanner -Label $BackendProfiles["nvidia"].Label -Mode "AUTO"
        return "nvidia"
    } elseif ($gpu.HasAmd) {
        Write-Info "Detected AMD GPU hardware."
        Write-DetectionBanner -Label $BackendProfiles["amd"].Label -Mode "AUTO"
        return "amd"
    }

    Write-Info "No NVIDIA or AMD GPU was detected. Using CPU backend."
    Write-DetectionBanner -Label $BackendProfiles["cpu"].Label -Mode "AUTO"
    return "cpu"
}

function Install-ProfilePackages {
    param(
        [string]$PythonExe,
        [string]$SelectedBackend
    )

    $profile = $BackendProfiles[$SelectedBackend]
    $packages = $profile.Packages

    Write-Info "Upgrading pip, setuptools, and wheel..."
    & $PythonExe -m pip install --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upgrade pip/setuptools/wheel."
    }

    if ($SelectedBackend -eq "nvidia") {
        Write-Info "Installing NVIDIA CUDA 11.8 PyTorch packages..."
        & $PythonExe -m pip install `
            "torch==$($packages.torch)" `
            "torchaudio==$($packages.torchaudio)" `
            "torchvision==$($packages.torchvision)" `
            --index-url "https://download.pytorch.org/whl/cu118" `
            --verbose
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install NVIDIA CUDA PyTorch packages."
        }
    } else {
        Write-Info "Installing base PyTorch packages for $($profile.Label)..."
        & $PythonExe -m pip install `
            "torch==$($packages.torch)" `
            "torchaudio==$($packages.torchaudio)" `
            "torchvision==$($packages.torchvision)" `
            --verbose
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install base PyTorch packages for $($profile.Label)."
        }
    }

    if ($SelectedBackend -eq "amd") {
        Write-Info "Installing torch-directml..."
        & $PythonExe -m pip install --pre "torch-directml==$($packages.torch_directml)" --verbose
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install torch-directml."
        }
    }

    $packageArgs = @(
        "-m", "pip", "install",
        "ultralytics==$($packages.ultralytics)",
        "onnx==$($packages.onnx)"
    )

    if ($packages.Contains("numpy") -and $packages.numpy) {
        Write-Info "Installing Ultralytics, ONNX, and NumPy..."
        $packageArgs += "numpy==$($packages.numpy)"
    } else {
        Write-Info "Installing Ultralytics and ONNX..."
    }

    $packageArgs += "--verbose"
    & $PythonExe @packageArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install the required model export packages for the selected backend."
    }
}

function Test-PythonImportsAndBackend {
    param(
        [string]$PythonExe,
        [string]$SelectedBackend
    )

    $profile = $BackendProfiles[$SelectedBackend]
    $expectedPackages = $profile.Packages | ConvertTo-Json -Compress

    $verificationScript = @"
import importlib
import json
import platform
import sys

selected_backend = "$SelectedBackend"
expected = json.loads(r'''$expectedPackages''')

for package_name, expected_version in expected.items():
    import_name = "torch_directml" if package_name == "torch_directml" else package_name
    module = importlib.import_module(import_name)
    actual_version = getattr(module, "__version__", None)
    if expected_version and actual_version != expected_version:
        raise SystemExit(f"{package_name} version mismatch. Expected {expected_version}, got {actual_version}")
    print(f"{package_name}=={actual_version}")

if selected_backend == "nvidia":
    import torch
    if not (torch.version.cuda and "11.8" in torch.version.cuda):
        raise SystemExit(f"Expected CUDA 11.8 capable torch build, got torch.version.cuda={torch.version.cuda}")

if selected_backend == "amd":
    import torch_directml
    device = torch_directml.device()
    print(f"torch_directml_device={device}")
"@

    Ensure-DownloadDirectory
    $tempScriptPath = Join-Path $DownloadDir "verify_python_packages.py"
    Set-Content -Path $tempScriptPath -Value $verificationScript -Encoding UTF8

    Write-Info "Verifying installed backend packages..."
    & $PythonExe $tempScriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "Backend package verification failed."
    }
}

try {
    Assert-WindowsEnvironment
    Assert-SupportedArchitecture
    Refresh-ProcessPath

    Write-StepBanner "STEP 1: Detecting Hardware Backend"
    $selectedBackend = Select-Backend -RequestedBackend $Backend
    Write-Info "Selected backend: $($BackendProfiles[$selectedBackend].Label)"

    Write-StepBanner "STEP 2: Detecting Python 3.11.9"
    $pythonExe = Ensure-PythonInstalled

    if ($selectedBackend -eq "nvidia") {
        Write-StepBanner "STEP 3: Detecting NVIDIA CUDA 11.8"
        $cudaPath = Ensure-CudaInstalled
    } elseif ($selectedBackend -eq "amd") {
        Write-StepBanner "STEP 3: Preparing AMD DirectML Path"
        Write-Info "AMD DirectML backend selected. No separate CUDA toolkit download is required."
    } else {
        Write-StepBanner "STEP 3: Preparing CPU Backend Path"
        Write-Info "CPU backend selected. No GPU runtime installation is required."
    }

    Write-StepBanner "STEP 4: Installing Required Python Packages"
    Install-ProfilePackages -PythonExe $pythonExe -SelectedBackend $selectedBackend

    Write-StepBanner "STEP 5: Verifying Installed Packages"
    Test-PythonImportsAndBackend -PythonExe $pythonExe -SelectedBackend $selectedBackend

    Write-Host ""
    if ($selectedBackend -eq "nvidia") {
        Write-Success "CUDA $RequiredCudaVersion is ready at $cudaPath"
    }
    Write-Success "$($BackendProfiles[$selectedBackend].Label) backend packages were installed successfully."
    Write-Success "Python $RequiredPythonVersion is ready for this project."
    Wait-BeforeExit
} catch {
    Write-Host ""
    Write-Fail $_.Exception.Message
    Wait-BeforeExit
    exit 1
}
