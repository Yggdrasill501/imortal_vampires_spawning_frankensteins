export default async function pageTitle({ page, input, log }) {
  await page.goto(input.url, { waitUntil: "domcontentloaded" });
  const title = await page.title();
  log("Read the page title.");
  return { title };
}
