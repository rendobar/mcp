// This text ships in the server handshake, so a client reads it before it ever
// calls a tool. It deliberately does NOT enumerate job types or the capabilities
// they cover. It used to, and the list went stale: agents read "Active job
// types" plus a "cannot do" list written months earlier and told users a live
// capability did not exist, without ever calling list_job_types. Only structural
// limits (things Rendobar is not, rather than types it has yet to launch) belong
// in a static string. Everything else is a live registry read.
export const SERVER_INSTRUCTIONS = `Rendobar runs media jobs in the cloud and returns hosted output URLs.

Call list_job_types first. It reads the job registry live, so it is the only
current answer to "can Rendobar do this". The job types are not listed here on
purpose: new ones launch over time and a static list would go stale. Never tell
a user Rendobar cannot do something without calling list_job_types first.

Workflow:
1. If the file is at a public HTTPS URL, pass it directly to submit_job as inputs.source (or another input name referenced by your command).
2. If the file is on the local disk, call upload_file first to get a downloadUrl, then use that as the input URL in submit_job.
3. For expensive jobs, call get_account first to confirm the balance covers the cost.
4. After submit_job, call get_job with wait:true — it blocks until the job finishes (up to ~50s, then returns a snapshot; call again to keep waiting). The output URL is on the complete response.
5. If submit_job fails with INVALID_JOB_TYPE, call list_job_types and pick from what it returns.

What Rendobar cannot do:
- Record screens or capture cameras
- Stream live media
- Run arbitrary local binaries (sharp, imagemagick, yt-dlp) — submit a job instead

For anything list_job_types does not cover, tell the user instead of improvising locally.`;
