!macro customInstallMode
  StrCpy $isForceMachineInstall 1
!macroend

!macro customInit
  SetShellVarContext all
  StrCpy $INSTDIR "$PROGRAMFILES64\ONNX Nova"
!macroend

!macro customInstall
  IfFileExists "$EXEDIR\setup\python-3.11.9-amd64.exe" 0 +3
  CreateDirectory "$INSTDIR\setup"
  CopyFiles /SILENT "$EXEDIR\setup\python-3.11.9-amd64.exe" "$INSTDIR\setup"
  IfFileExists "$EXEDIR\setup\cuda_11.8.0_522.06_windows.exe" 0 +3
  CreateDirectory "$INSTDIR\setup"
  CopyFiles /SILENT "$EXEDIR\setup\cuda_11.8.0_522.06_windows.exe" "$INSTDIR\setup"
  CreateShortcut "$DESKTOP\ONNX Nova.lnk" "$INSTDIR\ONNX Nova.exe" "" "$INSTDIR\resources\icon.ico" 0
  MessageBox MB_ICONQUESTION|MB_YESNO "Would you like to run the Python and GPU dependency setup now?$\r$\n$\r$\nThis will detect Python, CUDA 11.8, and the correct backend packages, then download only what is missing." IDNO skipDependencySetup
  ExecShell "open" "$INSTDIR\resources\tools\install-python-deps.bat"
  skipDependencySetup:
!macroend
