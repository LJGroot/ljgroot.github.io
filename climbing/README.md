# Climbing progression tracker

This folder is a private climbing-progression page for GitHub Pages.

## Features

- Sign-in screen using Supabase Auth.
- Private cloud database.
- Add and edit sends.
- CSV import.
- Score logic based on the workbook:
  - RP = base grade value
  - FL = base grade value plus 10
  - OS = base grade value plus 15
- Valid sends are those from the previous 180 days.
- Dashboard: valid sends, current level, hardest send, yearly goal, progression chart and grade chart.

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
    https://ljgroot.github.io/
    
Add this Redirect URL:
    
    https://ljgroot.github.io/climbing/
    
### 5. Add the project credentials

In Supabase:
    
    Project Settings → API
    
Copy:

- Project URL
- Publishable key / anon key

Paste them into `assets/config.js`.

Never use or publish the `service_role` key in this project.

### 6. Import historic sends

Export the relevant Excel send-log rows as a CSV with exactly these column names:
    
    gym_crag,sent_on,route,grade,ascent_type
    
Example:
    
    gym_crag,sent_on,route,grade,ascent_type
    HS,2026-10-01,Wit crimps,7a+,RP
    Cuzoul plage,2026-08-07,Vibrosaure,7a+,RP
    
After signing in, use the `Import CSV` button on the tracker page.

### 7. Publish with GitHub Pages

In the repository that powers `ljgroot.github.io`:

1. Create a folder named `climbing`.
2. Copy all files created by the Python script into that folder.
3. Commit and push.

The page will be available at:
    
    https://ljgroot.github.io/climbing/
    
## Privacy

The website files themselves do not contain your climbing data. The data is stored in Supabase and protected by Row-Level Security, so only your signed-in account can read or update its sends.
