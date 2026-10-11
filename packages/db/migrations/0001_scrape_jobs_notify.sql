-- Wake idle scraper workers when a job is queued. Payload is the pool name.
CREATE FUNCTION notify_scrape_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('scrape_jobs', NEW.pool);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER scrape_jobs_notify
AFTER INSERT OR UPDATE OF status ON scrape_jobs
FOR EACH ROW WHEN (NEW.status = 'queued')
EXECUTE FUNCTION notify_scrape_job();
