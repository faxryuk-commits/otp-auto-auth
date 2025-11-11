import { test, expect } from "@playwright/test";

// Заготовка сценария авторизации через WhatsApp OTP
// Требует настроенного мок-сервера WhatsApp Cloud API и заполненных переменных окружения.

test.describe.skip("WhatsApp OTP auth", () => {
  test("пользователь получает и подтверждает OTP", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "WhatsApp" }).click();
    await page.getByLabel("Номер телефона").fill("+971500000000");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Получить код" }).click();

    // TODO: интегрировать мок WhatsApp и дождаться кода
    await page.getByPlaceholder("123456").fill("123456");
    await page.getByRole("button", { name: "Подтвердить" }).click();

    await expect(page).toHaveURL(/\/app/);
  });
});
