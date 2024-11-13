---
author: JZ
pubDatetime: 2024-11-10T08:22:00Z
modDatetime: 2024-11-10T10:12:00Z
title: Add Discord and Disqus to your web site
featured: true
tags:
  - blog
description:
  "add discord and disqus to this site"
---


## Table of contents

## Description

I recently added Discord and Disqus to this site.

### Disqus

Setting up is pretty straight forward.

1. Create an free account with Disqus
2. Create a site and add your website's address
3. Get the javascript and embed it your site. Add it to all pages where you intended to have discussion or comment. I added disqus to each post's page with astro layout. Had to fix some typescript strict type check issues.

Overall it is working pretty smoothly. Safari seems to have problem loading the widget. It just does not show at all. In chrome or microsoft edge sometimes you have to reload.

```javascript
<script>
      /**
       *  RECOMMENDED CONFIGURATION VARIABLES: EDIT AND UNCOMMENT THE SECTION BELOW TO INSERT DYNAMIC VALUES FROM YOUR PLATFORM OR CMS.
       *  LEARN WHY DEFINING THESE VARIABLES IS IMPORTANT: https://disqus.com/admin/universalcode/#configuration-variables    */

      var disqus_config = function (this:any) {
        this.page.url = Astro.props.post.url;  // Replace PAGE_URL with your page's canonical URL variable
        this.page.identifier = Astro.props.post.title; // Replace PAGE_IDENTIFIER with your page's unique identifier variable
      };

      (function() { // DON'T EDIT BELOW THIS LINE
        var d = document, s = d.createElement('script');
        s.src = 'https://******.disqus.com/embed.js';
        s.setAttribute('data-timestamp', String(new Date()));
        (d.head || d.body).appendChild(s);
      })();
    </script>
```

### Discord

Found this [article](https://davidbieber.com/snippets/2022-06-20-chat-by-tag/) which is very helpful.

I added a social button (an invitation to join the discord server). A floating button on the home page and an expandable section at the bottom of each post to allow chat and discussion on the discord server.

```javascript
// floating button: replace with your server and channel
<script src='https://cdn.jsdelivr.net/npm/@widgetbot/crate@3' async defer>
      new Crate({
        server: '******', // JZLeetCode
        channel: '******' // #general
      })
    </script>
```

toggle section

```html
<div>
  <details id="chat-details">
    <summary><h3>Expand to chat 💬 on Discord </h3></summary>
    <widgetbot
      server="******"
      channel="******"
      width="100%"
      height="600">
    </widgetbot>
  </details>
</div>
<script>
  let chatLoaded = false;
  const details = document.querySelector("#chat-details")! as HTMLElement;
  details.addEventListener("toggle", event => {
    if (details.hasAttribute('open') && !chatLoaded) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/@widgetbot/html-embed";
      document.head.appendChild(script);
      chatLoaded = true;
    }
  });
</script>
```
