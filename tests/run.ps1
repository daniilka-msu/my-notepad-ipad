$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$runFile=Join-Path $root '.browser-tests.html'
$profile=Join-Path $env:TEMP ('notepad-tests-'+[guid]::NewGuid())
$output=Join-Path $env:TEMP ('notepad-results-'+[guid]::NewGuid()+'.txt')
$errors=$output+'.errors'
$html=Get-Content (Join-Path $root 'index.html') -Raw -Encoding utf8
$source=Get-Content (Join-Path $root 'app.js') -Raw -Encoding utf8
$tests=Get-Content (Join-Path $PSScriptRoot 'critical.js') -Raw -Encoding utf8
$html=$html.Replace('<script src="app.js"></script>',"<script>$source</script><script>$tests</script>")
[IO.File]::WriteAllText($runFile,$html)
try {
 $edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
 $uri=([uri]$runFile).AbsoluteUri
 Start-Process -FilePath $edge -WindowStyle Hidden -Wait -ArgumentList '--headless','--disable-gpu','--no-first-run',"--user-data-dir=$profile",'--virtual-time-budget=12000','--dump-dom',$uri -RedirectStandardOutput $output -RedirectStandardError $errors
 $result=Get-Content $output -Raw -Encoding utf8
 $match=[regex]::Match($result,'<pre id="results">([\s\S]*?)</pre>')
 if(!$match.Success){throw 'Browser tests did not complete. Check browser errors.'}
 [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
 if($match.Groups[1].Value.Contains('FAIL')){throw 'Browser tests failed'}
} finally {Remove-Item -LiteralPath $runFile -ErrorAction SilentlyContinue}
