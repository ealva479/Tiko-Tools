' Double-click to start the launcher without a terminal window.
' Run "Tiko Launcher.bat" once first so dependencies are installed.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c npm start", 0, False
