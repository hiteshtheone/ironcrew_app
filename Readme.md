DB migration for ironcrew 
export DATABASE_URL='postgresql://postgres.cmgyrukizmczrrkqqqqq:<password>%40123@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
migrate -verbose -path db/migrations -database "$DATABASE_URL" up
