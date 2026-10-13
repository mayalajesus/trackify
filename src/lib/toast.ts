import { toast as heroToast } from "@heroui/react/toast";

const DEFAULT_TOAST_TIMEOUT = 15_000;
type ToastOptions = NonNullable<Parameters<typeof heroToast>[1]>;

function withReadingTime(options?: ToastOptions): ToastOptions {
  return { timeout: DEFAULT_TOAST_TIMEOUT, ...options };
}

export const toast = {
  success: (...[message, options]: Parameters<typeof heroToast.success>) =>
    heroToast.success(message, withReadingTime(options)),
  danger: (...[message, options]: Parameters<typeof heroToast.danger>) =>
    heroToast.danger(message, withReadingTime(options)),
  info: (...[message, options]: Parameters<typeof heroToast.info>) =>
    heroToast.info(message, withReadingTime(options)),
  warning: (...[message, options]: Parameters<typeof heroToast.warning>) =>
    heroToast.warning(message, withReadingTime(options)),
};
