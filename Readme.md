DB migration for ironcrew 
export DATABASE_URL='postgresql://postgres.cmgyrukizmczrrkqqqqq:<password>%40123@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
migrate -verbose -path db/migrations -database "$DATABASE_URL" up

# Seed shared exercises, workouts, and plans
# From Projects/ironcrew, after the migrations above. DATABASE_URL must already be set.
# The script seeds exercises, validates every catalog, then applies workouts before plans.
./scripts/seed-catalog.sh
