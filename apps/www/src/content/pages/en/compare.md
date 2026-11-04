---
title: Laman compared with WordPress, Joomla and Drupal
description: A fair comparison of what a government agency website needs, and when a general-purpose CMS is the better choice.
path: /en/compare
alternate: /banding
heading: "Laman compared with WordPress, Joomla and Drupal"
lead: "WordPress, Joomla and Drupal are mature, capable systems that run a large part of the world's web. The question isn't which is better in general, but what a government agency website needs: secure, accessible, easy to look after, and updated by its own officers."
comparison: true
---

## Side by side

|                                            | Laman                                                    | WordPress                           | Joomla                                          | Drupal                                                  |
| ------------------------------------------ | -------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| What the public reaches                    | Static HTML files                                        | A PHP application and a database    | A PHP application and a database                | A PHP application and a database                        |
| Runs on                                    | One Node process and one SQLite file                     | PHP, MySQL or MariaDB, a web server | PHP, MySQL, MariaDB or PostgreSQL, a web server | PHP, MySQL, MariaDB, PostgreSQL or SQLite, a web server |
| Extending it                               | No plugins, by design                                    | Plugins and themes                  | Extensions and templates                        | Modules and themes                                      |
| Consistent look                            | FTDS blocks only, no free styling                        | Up to the theme and each editor     | Up to the template and each editor              | Up to the theme and each editor                         |
| Accessibility checks before publishing     | Built in; a page with no main heading can't be published | Plugin                              | Built in since Joomla 4.1 (Jooa11y)             | Contributed module                                      |
| Two-factor sign-in                         | Built in, can be required                                | Plugin                              | Built in                                        | Contributed module                                      |
| Visitor analytics without cookies          | Built in                                                 | Plugin or third party               | Extension or third party                        | Module or third party                                   |
| Website keeps working if the admin is down | Yes                                                      | No, without a static export tool    | No, without a static export tool                | No, without a static export tool                        |
| Design freedom                             | Limited: the agency's colour, logo and name              | Full                                | Full                                            | Full                                                    |
| Ecosystem and community                    | New and small                                            | Very large                          | Large                                           | Large                                                   |
| Licence                                    | MIT                                                      | GPL                                 | GPL                                             | GPL                                                     |

Last checked 4 November 2026. If a fact has changed, [let us know](/en/contact).

## Why "no plugins" is a feature

Plugins are the strength of WordPress, Joomla and Drupal: almost anything can be added. But every plugin is third-party code running on the agency's server, on its own update schedule.

Patchstack reported 7,966 new security vulnerabilities in the WordPress ecosystem in 2024, the large majority of them in plugins rather than WordPress core. That isn't a failure of WordPress. It's the price of being open to plugins.

Laman takes another path. Every block is part of Laman itself, tested together and updated together. And what the public reaches is static files, with no database or server code to attack.

## Still on Joomla 3 or Drupal 7?

Joomla 3 stopped receiving free security fixes on 17 August 2023. Drupal 7 stopped receiving security updates on 5 January 2025. A website still on either should be moved, whether to Laman or to a version that's still supported.

## Laman isn't for everyone

We'd rather you picked the right tool than picked Laman. A general-purpose CMS is the better choice if you need:

- **Forms that store submissions,** such as online applications or complaints. Laman publishes a static website; forms need another system.
- **Sign-in for the public,** such as a members' portal.
- **E-commerce** or payments.
- **A custom design** outside FTDS.
- **Something that only exists as a plugin,** and can't wait.

Laman is also new. It doesn't have an approval workflow yet, and editing Bahasa Melayu and English side by side isn't built yet. We say so here so it doesn't surprise you later.

## Moving from your current system

There's no automatic importer yet. Content moves across page by page, and that's often a chance to improve it: posters become text everyone can read, PDFs become pages, and menus that follow the org chart become menus that follow what visitors look for.

An AI agent connected over MCP can do much of this copying, as the officer, with every draft waiting for the officer to publish.

[Contact the team](/en/contact) if you'd like to talk about moving.

## Sources

- Joomla: [Joomla 3 series end of support](https://developer.joomla.org/news/676-joomla-3-retiring-as-joomla-4-comes-to-life.html); [Joomla 4.1.0: new standards in accessible website design](https://www.joomla.org/announcements/release-news/joomla-4-1-0-stable-new-standards-in-accessible-website-design.html); [User Actions Log](https://guide.joomla.org/user-manual/users/users-user-actions-log)
- Drupal: [Drupal 7 end of life](https://www.drupal.org/node/3375636); [Scheduler](https://www.drupal.org/project/scheduler); [Redirect](https://www.drupal.org/project/redirect); [AI Agents](https://www.drupal.org/project/ai_agents)
- WordPress: [Patchstack, State of WordPress Security in 2025](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2025/); [From abilities to AI agents: the WordPress MCP Adapter](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
