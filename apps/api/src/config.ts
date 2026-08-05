const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgres://notionlike:change-me@localhost:5432/notionlike"),
  appUrl: required("APP_URL", "http://localhost:3000"),
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
  secureCookies: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
  s3: {
    endpoint: required("S3_ENDPOINT", "http://localhost:9000"),
    publicUrl: required("S3_PUBLIC_URL", "http://localhost:9000"),
    region: required("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET", "notionlike"),
    accessKey: required("S3_ACCESS_KEY", "notionlike"),
    secretKey: required("S3_SECRET_KEY", "change-me-too"),
  },
};
