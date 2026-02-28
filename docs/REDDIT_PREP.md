# Reddit Prep (without API credentials)

## Current mode
- No Reddit API credentials required.
- Use fallback sources only:
  - `site:reddit.com` queries through SearXNG
  - Subreddit RSS feeds

## Why this mode
- Keeps setup local-first and cost-free.
- Avoids blocking implementation until API credentials exist.

## Optional future switch
When credentials are available, add dedicated Reddit node credentials in n8n and a parallel source branch in the research workflow.
