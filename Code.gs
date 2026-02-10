/**
 * Roomly v2 — Apps Script Wrapper
 * Serves the compiled Vite frontend as HTML Service.
 * 
 * SETUP:
 * 1. Run `npm run build` in the gestReservas folder
 * 2. Copy the contents of dist/index.html
 * 3. Paste it into the getCompiledHtml_() function below
 * 4. Deploy this as a Web App in Apps Script
 * 
 * For Development: Use `npm run dev` with Vite directly (localhost:3000)
 * For Production: Deploy this Apps Script as Web App
 */

function doGet(e) {
  return HtmlService.createHtmlOutput(getCompiledHtml_())
    .setTitle('Roomly — Tu comunidad, conectada')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Returns the compiled HTML from Vite build.
 * After running `npm run build`, paste the contents of dist/index.html here.
 */
function getCompiledHtml_() {
  // PLACEHOLDER: Replace with actual build output
  // Run: npm run build
  // Then copy dist/index.html contents here
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Roomly</title>
  <style>
    body { 
      font-family: 'Outfit', sans-serif; 
      background: #0a0a1a; 
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .loading {
      text-align: center;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="loading">
    <svg width="80" height="80" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="12" fill="#7C3AED"/>
      <path d="M12 28V16L20 10L28 16V28" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20 28V22" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="20" cy="16" r="2" fill="white"/>
    </svg>
    <h2>Roomly</h2>
    <p>Compilar con: npm run build</p>
  </div>
</body>
</html>
  `;
}

// ─── Apps Script Menu (for Sheets-based admins) ───

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏠 Roomly')
    .addItem('Abrir App', 'openApp')
    .addItem('Ver URL de Deploy', 'showDeployUrl')
    .addToUi();
}

function openApp() {
  var url = ScriptApp.getService().getUrl();
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '");google.script.host.close();</script>'
  ).setWidth(200).setHeight(50);
  SpreadsheetApp.getUi().showModalDialog(html, 'Abriendo Roomly...');
}

function showDeployUrl() {
  var url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert('URL de Roomly:\n\n' + url);
}
