import { test, expect } from "@playwright/test";

// Заготовка сценария авторизации через Telegram Login Widget.
// Для запуска потребуется заглушка Telegram API и эмуляция виджета.

test.describe.skip("Telegram SSO", () => {
  test("успешный вход через Telegram", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Telegram" }).click();

    // TODO: смонтировать мок-скрипт Telegram и пробросить payload в window.__onTelegramAuth

    await page.evaluate(() => {
      type TelegramWindow = typeof window & {
        __onTelegramAuth?: (payload: Record<string, unknown>) => void;
      };
      const tgWindow = window as TelegramWindow;
      tgWindow.__onTelegramAuth?.({
        id: 123456789,
        first_name: "Ivan",
        username: "ivan12",
        auth_date: Math.floor(Date.now() / 1000),
        hash: "mock",
      });
    });

    await expect(page).toHaveURL(/\/app/);
  });
});
