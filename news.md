---
layout: page
title: News
permalink: /news/
---

<ul class="news-list">
  {% assign all_news = site.data.news | sort: "date" | reverse %}
  {% for item in all_news %}
    {% include news-item.html item=item %}
  {% endfor %}
</ul>
