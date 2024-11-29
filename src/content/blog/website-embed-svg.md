---
author: JZ
pubDatetime: 2024-11-23T03:23:00Z
modDatetime: 2024-11-23T03:23:00Z
title: How to Embed an SVG Image/Picture with the Code or File on a Website
featured: true
tags:
  - cheatsheet-website
description:
  "three main ways to embed an SVG image or picture as a file or using html code on a website"
---

## How to Embed and Where to Find Great SVG Icons

There are three main ways to embed an SVG picture file on a website.

1. Use `img` tag in html, e.g., `<img src = "file.svg" alt="description of the picture"/>`.
2. Use as a CSS `background-image`, e.g., `body { background-image: url(happy.svg); }`.
3. Use the `svg` tag in html, e.g., `<svg> <path d="replace with the actual content in the svg file" /> </svg>`. You can open the downloaded SVG file with a text editor and find the text content. This way you do not have to serve the svg file. For a real example, you can view the html source for this webpage and search for '<svg'. Kudos to this [reference](https://astro-paper.pages.dev/posts/dynamic-og-image-generation-in-astropaper-blog-posts/). You can find svg icons at [tabler](https://tabler.io/icons) and [streamlinehq](https://www.streamlinehq.com/icons).

## JavaScript Dynamic Content

Stay tuned for using JavaScript to make all links on a webpage to open in a new tab. 
