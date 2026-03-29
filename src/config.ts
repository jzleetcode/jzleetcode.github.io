import type socialIcons from "@/assets/socialIcons";

export type SocialObjects = {
  name: keyof typeof socialIcons;
  href: string;
  active: boolean;
  linkTitle: string;
}[];

export const SOCIALS: SocialObjects = [
  {
    name: "BuyMeCoffee",
    href: "https://buymeacoffee.com/jzzcoding",
    linkTitle: "Buy me a coffee",
    active: true,
  },
  {
    name: "Github",
    href: "https://github.com/jzleetcode/jzleetcode.github.io",
    linkTitle: "JZLeetCode on GitHub",
    active: true,
  },
];

export const SITE = {
  website: "https://jzleetcode.github.io",
  author: "JZLeetCode",
  profile: "https://jzleetcode.github.io/about",
  desc: "LeetCode",
  title: "JZLeetCode",
  ogImage: "jzzcoding.jpg",
  lightAndDarkMode: true,
  postPerIndex: 8,
  postPerPage: 6,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: false,
    text: "Edit page",
    url: "",
  },
  dynamicOgImage: true,
  dir: "ltr" as const,
  lang: "en",
  timezone: "America/New_York",
} as const;
