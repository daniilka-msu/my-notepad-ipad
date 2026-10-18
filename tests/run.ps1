$ErrorActionPreference='Stop'
$node=Get-Command node -ErrorAction SilentlyContinue
if($node){$runtime=$node.Source}else{$runtime=Join-Path $env:TEMP 'notepad-node.exe'}
if(!(Test-Path $runtime)){throw 'Install Node.js 22 or newer to run tests.'}
& $runtime (Join-Path $PSScriptRoot 'run.mjs')
if($LASTEXITCODE -ne 0){throw 'Browser tests failed'}
