/**
 * End-to-end integration test using Playwright and Chrome for Testing.
 * Verifies link handling in the extension viewer workbench:
 * 1. External links open safely in a new tab without navigating the workbench.
 * 2. In single-file mode, relative links are blocked from navigating to chrome-extension://... 404.
 * 3. In workspace mode, PDF links generate application/pdf Blob URLs and open in new tabs.
 * 4. In workspace mode, downloadable archives (.zip) trigger downloads.
 * 5. In workspace mode, missing files show friendly alerts without 404 navigation.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extensionPath = join(root, 'dist');

const tempUserData = mkdtempSync(join(tmpdir(), 'chrome-ext-e2e-'));

try {
  console.log('1. Launching Chrome for Testing with extension...');
  const context = await chromium.launchPersistentContext(tempUserData, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  // Wait for extension background service worker to obtain extensionId
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 10000 });
  }
  const extensionId = background.url().split('/')[2];
  console.log(`✓ Extension loaded, ID: ${extensionId}`);

  const page = await context.newPage();
  const viewerUrl = `chrome-extension://${extensionId}/viewer/viewer.html`;
  await page.goto(viewerUrl);

  // Wait for viewer init to complete
  await page.waitForFunction(() => window.__testHooks?.ready === true, { timeout: 10000 });
  console.log('✓ Viewer workbench initialized and ready');

  // --- Scenario 1: External Links ---
  console.log('\n2. Testing external link interception...');
  await page.evaluate(() => {
    document.getElementById('workspace-shell').hidden = false;
    document.getElementById('empty-state').hidden = true;
    const content = document.getElementById('ws-content');
    content.hidden = false;
    content.innerHTML = `
      <div id="vscode-md-preview-root" class="vscode-md-preview-root">
        <a id="test-ext" data-href="https://example.com/docs" href="https://example.com/docs">External Link</a>
      </div>
    `;
  });

  const extPagePromise = context.waitForEvent('page');
  await page.click('#test-ext');
  const extPage = await extPagePromise;
  await extPage.waitForLoadState('domcontentloaded');
  assert.match(extPage.url(), /example\.com/, 'External link should open in a new tab');
  await extPage.close();
  assert.equal(page.url(), viewerUrl, 'Workbench tab must not be replaced');
  console.log('✓ External link opened in new tab safely');

  // --- Scenario 2: Single-file mode relative link protection ---
  console.log('\n3. Testing relative link protection in single-file mode...');
  let singleFileAlert = '';
  page.once('dialog', async (dialog) => {
    singleFileAlert = dialog.message();
    await dialog.accept();
  });

  await page.evaluate(() => {
    const content = document.getElementById('ws-content');
    content.innerHTML = `
      <div id="vscode-md-preview-root" class="vscode-md-preview-root">
        <a id="test-single-pdf" data-href="00-Intro/00-dedication-Dedication.pdf" href="00-Intro/00-dedication-Dedication.pdf">PDF Book</a>
      </div>
    `;
  });

  await page.click('#test-single-pdf');
  await page.waitForTimeout(200);

  assert.match(singleFileAlert, /单文件模式/, 'Should alert user that single file mode cannot access relative paths');
  assert.equal(page.url(), viewerUrl, 'Must not navigate to chrome-extension://... 404');
  console.log('✓ Single file mode blocked 404 navigation and alerted user');

  // --- Setup Workspace Mock for Scenarios 3, 4, 5 ---
  console.log('\n4. Setting up mock workspace in viewer...');
  await page.evaluate(() => {
    const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    const zipContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK..

    const fakePdfFile = new File([pdfContent], '00-dedication-Dedication.pdf', { type: 'application/pdf' });
    const fakeZipFile = new File([zipContent], 'bundle.zip', { type: 'application/zip' });

    const mockRoot = {
      kind: 'directory',
      name: 'my-project',
      async getDirectoryHandle(name) {
        if (name === '00-Intro') {
          return {
            kind: 'directory',
            name: '00-Intro',
            async getDirectoryHandle() {
              throw new DOMException('Not found', 'NotFoundError');
            },
            async getFileHandle(file) {
              if (file === '00-dedication-Dedication.pdf') {
                return {
                  kind: 'file',
                  name: '00-dedication-Dedication.pdf',
                  async getFile() {
                    return fakePdfFile;
                  },
                };
              }
              throw new DOMException('Not found', 'NotFoundError');
            },
          };
        }
        if (name === 'assets') {
          return {
            kind: 'directory',
            name: 'assets',
            async getDirectoryHandle() {
              throw new DOMException('Not found', 'NotFoundError');
            },
            async getFileHandle(file) {
              if (file === 'bundle.zip') {
                return {
                  kind: 'file',
                  name: 'bundle.zip',
                  async getFile() {
                    return fakeZipFile;
                  },
                };
              }
              throw new DOMException('Not found', 'NotFoundError');
            },
          };
        }
        throw new DOMException('Not found', 'NotFoundError');
      },
      async getFileHandle(file) {
        throw new DOMException('Not found', 'NotFoundError');
      },
    };

    window.__testHooks.setWorkspace(mockRoot, 'local', 'README.md');
  });

  // --- Scenario 3: Workspace PDF link ---
  console.log('5. Testing workspace PDF link resolution & opening in new tab...');
  await page.evaluate(() => {
    const content = document.getElementById('ws-content');
    content.innerHTML = `
      <div id="vscode-md-preview-root" class="vscode-md-preview-root">
        <a id="test-ws-pdf" data-href="00-Intro/00-dedication-Dedication.pdf" href="00-Intro/00-dedication-Dedication.pdf">Dedication PDF</a>
      </div>
    `;
  });

  const pdfPagePromise = context.waitForEvent('page');
  await page.click('#test-ws-pdf');
  const pdfPage = await pdfPagePromise;

  const pdfUrl = pdfPage.url();
  console.log(`   Captured PDF tab URL: ${pdfUrl}`);
  assert.match(pdfUrl, /^blob:chrome-extension:\/\//, 'PDF tab URL should be a blob:chrome-extension:// URL');

  // Verify blob type
  const pdfBlobType = await page.evaluate(async (blobUrl) => {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return blob.type;
  }, pdfUrl);

  assert.equal(pdfBlobType, 'application/pdf', 'Blob Content-Type must be application/pdf');
  await pdfPage.close();
  assert.equal(page.url(), viewerUrl, 'Workbench tab remains intact');
  console.log('✓ Workspace PDF opened in new tab with application/pdf MIME type');

  // --- Scenario 4: Workspace Downloadable (.zip) ---
  console.log('\n6. Testing workspace binary download (.zip)...');
  await page.evaluate(() => {
    const content = document.getElementById('ws-content');
    content.innerHTML = `
      <div id="vscode-md-preview-root" class="vscode-md-preview-root">
        <a id="test-ws-zip" data-href="assets/bundle.zip" href="assets/bundle.zip">Download ZIP</a>
      </div>
    `;
  });

  const downloadPromise = page.waitForEvent('download');
  await page.click('#test-ws-zip');
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'bundle.zip', 'Suggested download filename should match');
  console.log(`✓ Binary download triggered correctly: ${download.suggestedFilename()}`);

  // --- Scenario 5: Missing file in workspace ---
  console.log('\n7. Testing missing file handling in workspace...');
  let missingAlert = '';
  page.once('dialog', async (dialog) => {
    missingAlert = dialog.message();
    await dialog.accept();
  });

  await page.evaluate(() => {
    const content = document.getElementById('ws-content');
    content.innerHTML = `
      <div id="vscode-md-preview-root" class="vscode-md-preview-root">
        <a id="test-ws-missing" data-href="not-found.pdf" href="not-found.pdf">Missing PDF</a>
      </div>
    `;
  });

  await page.click('#test-ws-missing');
  await page.waitForTimeout(200);

  assert.match(missingAlert, /工作区中未找到文件/, 'Should display missing file alert');
  assert.equal(page.url(), viewerUrl, 'Page must not navigate to 404 on missing file');
  console.log('✓ Missing file alerted cleanly without navigating to 404');

  await context.close();
  console.log('\n========================================');
  console.log('🎉 ALL END-TO-END VERIFICATION CHECKS PASSED!');
  console.log('========================================');
} finally {
  rmSync(tempUserData, { recursive: true, force: true });
}
