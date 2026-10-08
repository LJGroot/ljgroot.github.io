# Climbing progression tracker

This folder is a climbing-progression dashboard that I host on my GitHub Pages. There is a public read-only version available on the index page. Admin login allows for access to making additions and edits to the Supabase SQL data frame that is connected to the dashboard.

## Features

- Sign-in screen using Supabase Auth.
- Private cloud database.
- Add and edit sends.
- CSV import.
- Score logic for sent routes:
  - French grading system
    - base number grade (1 - 9)
      - open ended scale but no routes graded higher than 9 currently exist.
    - letter (a, b, c) and + symbol modifiers
      - total of 3 * 2 = 6 increments per base grade
  - 100 * (base grade number) plus 100 * (1/6) increments
    - examples
      - 6a+ -> 100 * 6 = 600 for base 6th grade (6a), with 600 plus (100 * (1/6)) = 616.67
      - 7b  -> 100 * 7 = 700 for base 7th grade (7a), with 700 plus (100 * (2/6)) = 733.33
  - RP = base grade value
  - FL = base grade value plus 10
  - OS = base grade value plus 15
- Valid sends are those from the previous 180 days.
- Dashboard: valid sends, current level, hardest send, yearly goal, progression chart and grade chart.
- Grade Pyramid

## Setup

### 1. Create a Supabase project

Create a project at https://supabase.com.

### 2. Create the database table

Open:
    
    SQL Editor → New query
    
Copy the entire contents of `supabase-schema.sql`, paste it, and run it.

### 3. Create your account and password

Go to:
    
    Authentication → Users
    
Create a user with your email address and your own password.

For a personal tracker, disable new public sign-ups after creating your account:
    
    Authentication → Providers → Email
    
This password is managed by Supabase. It is not stored in the GitHub repository.

### 4. Configure allowed URLs

In Supabase, go to:
    
    Authentication → URL Configuration
    
Set:
    
    Site URL:
    https://[username].github.io/
    
Add this Redirect URL:
    
    https://[username].github.io/climbing/
    
### 5. Add the project credentials

In Supabase:
    
    Project Settings → API
    
Copy:

- Project URL
- Publishable key / anon key

Paste them into `assets/config.js`.

Never use or publish the `service_role` key in this project.

### 6. Import historic sends

Export the any archival sends in CSV format with exactly these column names:
    
    gym_crag,sent_on,route,grade,ascent_type,style

Notes: 
  gym_crag: character string
  sent_on: date, use format YYYY-MM-DD
  route: character string
  grade: French grading style, lower than 6a not allowed in current app.js code
  ascent_style: RP, FL, OS (redpoint, flash, on-sight)
  style: TR, LD (toprope, lead)
   
Example:
    
    gym_crag,sent_on,route,grade,ascent_type,style
    HS,2026-10-01,Wit crimps,7a+,RP,TR
    Cuzoul plage,2026-08-07,Vibrosaure,7a+,RP,LD
    
After signing in, use the `Import CSV` button on the tracker page.

### 7. Publish with GitHub Pages

In the repository that powers `ljgroot.github.io`:

1. Create a folder named `climbing`.
2. Copy all files (README.md, index.html, admin.html, supabase-schema.sql) and the assets folder (containing app.js, config.js, styles.css) into that.
3. Commit and push.

The page will be available at:
    
    https://[username].github.io/climbing/
    
## Privacy

The website files themselves do not contain your climbing data. The data is stored in Supabase and protected by Row-Level Security, so only your signed-in account can add or update sends.
