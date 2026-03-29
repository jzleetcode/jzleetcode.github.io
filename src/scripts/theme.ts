declare global {
  interface Window {
    theme: {
      themeValue: string;
      getTheme: () => string;
      setTheme: (val: string) => void;
    };
  }
}

export {};

function setDarkMode(dark: boolean) {
  const theme = dark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  window.theme.setTheme(theme);
}

function toggleTheme() {
  setDarkMode(window.theme.getTheme() !== "dark");
}

function initThemeButton() {
  document.querySelector("#theme-btn")?.addEventListener("click", toggleTheme);
}

document.addEventListener("astro:after-swap", initThemeButton);
initThemeButton();
