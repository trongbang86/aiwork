const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.AIWORK_BASE_URL || 'http://localhost:4300';
const requestedWorkItemId = process.env.AIWORK_WORK_ITEM_ID;
const token = process.env.AIWORK_API_TOKEN || 'dev-token';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let originalInstructions;
  let workItemId;

  try {
    const itemsResponse = await context.request.get(`${baseUrl}/v1/work-items`);
    assert.equal(itemsResponse.ok(), true, 'work items must be available');
    const items = await itemsResponse.json();
    const byId = new Map(items.map((item) => [item.id, item]));
    const completeStory = items.find((item) => {
      const epic = byId.get(item.parentId);
      const initiative = epic && byId.get(epic.parentId);
      const project = initiative && byId.get(initiative.parentId);
      return item.type === 'story' && epic?.type === 'epic' && initiative?.type === 'initiative' && project?.type === 'project';
    });
    workItemId = requestedWorkItemId || completeStory?.id;
    assert.ok(workItemId, 'a work item with a complete Project → Initiative → Epic → Story chain is required');
    await context.addCookies([{
      name: 'aiwork_csrf',
      value: 'playwright-local-csrf',
      url: baseUrl,
    }]);
    await page.route('**/v1/**', async (route) => {
      const request = route.request();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
        await route.continue({ headers: { ...request.headers(), authorization: `Bearer ${token}` } });
        return;
      }
      await route.continue();
    });

    await page.goto(`${baseUrl}/work-items/${encodeURIComponent(workItemId)}`);
    const instructions = page.getByRole('textbox', { name: 'AI instructions' });
    originalInstructions = await instructions.inputValue();

    const navigateUp = page.getByRole('link', { name: /Navigate up to/i });
    await assert.doesNotReject(() => navigateUp.waitFor({ state: 'visible' }));
    const parentHref = await navigateUp.getAttribute('href');
    assert.match(parentHref || '', /^\/work-items\//, 'Navigate Up must link to the immediate parent');

    const marker = `Playwright immediate-save ${Date.now()}`;
    let documentLoads = 0;
    page.on('domcontentloaded', () => { documentLoads += 1; });
    const loadsBeforeSave = documentLoads;
    await instructions.fill(marker);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();

    assert.equal(await instructions.inputValue(), marker, 'saved AI instructions should update immediately');
    assert.equal(documentLoads, loadsBeforeSave, 'saving must not reload or navigate the document');
    assert.match(await page.locator('[data-effective-context]').innerText(), new RegExp(marker));
    assert.match(await page.locator('[data-provenance-items]').innerText(), new RegExp(marker));

    console.log('PASS: AI instructions reconcile in place and immediate-parent navigation is available.');
  } finally {
    if (originalInstructions !== undefined && workItemId) {
      const current = await context.request.get(`${baseUrl}/v1/work-items/${encodeURIComponent(workItemId)}/ai?mode=full`);
      if (current.ok()) {
        const value = await current.json();
        await context.request.patch(`${baseUrl}/v1/work-items/${encodeURIComponent(workItemId)}`, {
          headers: { authorization: `Bearer ${token}` },
          data: { aiInstructions: originalInstructions, expectedVersion: value.workItem.version },
        });
      }
    }
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
