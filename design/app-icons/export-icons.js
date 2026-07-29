async (page) => {
  await page.setViewportSize({ width: 1024, height: 1024 });
  const names = ["01-order-grid", "02-time-orbit", "03-course-flow", "04-campus-stack", "05-glass-timetable"];
  for (const name of names) {
    await page.goto(`http://127.0.0.1:8127/${name}.svg`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.tagName.toLowerCase() === "svg");
    await page.screenshot({ path: `design/app-icons/${name}-1024.png` });
  }
  return names;
}
