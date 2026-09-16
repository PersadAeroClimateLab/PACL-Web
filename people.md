---
layout: page
title: People
permalink: /people/
---

{% assign pi = site.data.people.current | where: "pi", true | first %}
{% if pi %}
  <div class="people-pi">
    {% include person.html person=pi %}
  </div>
{% endif %}

{% assign non_pi_current = site.data.people.current | where_exp: "p", "p.pi != true" %}
{% if non_pi_current.size > 0 %}
  <h2>Current members</h2>
  <div class="people-grid">
    {% for person in non_pi_current %}
      {% include person.html person=person %}
    {% endfor %}
  </div>
{% else %}
  <p><em>Current roster not yet loaded — pending real content.</em></p>
{% endif %}

{% if site.data.people.past.size > 0 %}
  <h2>Past members</h2>
  <div class="people-grid">
    {% for person in site.data.people.past %}
      {% include person.html person=person %}
    {% endfor %}
  </div>
{% endif %}
