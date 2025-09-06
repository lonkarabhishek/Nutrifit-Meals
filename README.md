# Nutrifit Meals

A production-ready subscription meal-delivery platform. This application includes client dashboards, live delivery tracking, chef workflows, and admin operations.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Backend**: Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions)
- **Deployment**: Vercel
- **Styling**: Tailwind CSS with shadcn/ui
- **Icons**: lucide-react
- **State Management**: React Query (`@tanstack/react-query`)
- **Maps**: Leaflet & OpenStreetMap
- **Charts**: Recharts
- **Forms**: `react-hook-form` & Zod
- **Testing**: Playwright (E2E), Vitest (unit)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- pnpm
- Supabase account and local CLI

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Nutrifit-Meals
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Set up Supabase:**
    - Link your project: `supabase link --project-ref <your-project-ref>`
    - Push migrations: `supabase db push`
    - Seed the database: `supabase db seed`

4.  **Set up environment variables:**
    - Copy `.env.example` to `.env.local`.
    - Fill in your Supabase project URL and keys.

5.  **Run the development server:**
    ```bash
    pnpm dev
    ```

    The application will be available at `http://localhost:3000`.

### Running Edge Functions Locally

To test Supabase Edge Functions on your local machine:

```bash
supabase functions serve
```

## Deployment

This application is configured for deployment on Vercel.

1.  Push your code to a GitHub repository.
2.  Import the repository into your Vercel account.
3.  Configure the environment variables in the Vercel project settings, including `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4.  Vercel will automatically build and deploy the application.

### Vercel Cron Jobs

The daily scheduling job is defined in `vercel.json` and will invoke the specified Supabase Edge Function.

Example cron configuration for `schedule-today` to run at 00:05 IST (18:35 UTC):

```json
{
  "crons": [
    {
      "path": "/api/cron/schedule-today",
      "schedule": "35 18 * * *"
    }
  ]
}
```
*Note: The Next.js app will need an API route handler to securely trigger the Supabase function.*

## Database

### Migrations

Database schema changes are managed through SQL migration files in `supabase/migrations`. To create a new migration:

```bash
supabase migration new <migration_name>
```

Apply migrations with `supabase db push`.

### Row-Level Security (RLS)

RLS is enabled on all tables containing sensitive user data. Policies are defined in the migration files to ensure users can only access their own data.

## Known Limitations & Future Roadmap

- **Payments**: Currently, there is no payment integration. Future work includes integrating Razorpay or Stripe for recurring subscriptions.
- **Dietary Plans**: The system supports a default meal plan. Future extensions will include multi-meal plans and dietary preferences (e.g., vegetarian, high-protein).
- **Notifications**: No notification system is in place. WhatsApp or email notifications for delivery updates and confirmations are planned.
