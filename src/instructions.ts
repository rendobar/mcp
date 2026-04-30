export const SERVER_INSTRUCTIONS = `Rendobar processes existing media files. To run a job:

1. If the file is at a public HTTPS URL, pass it directly to submit_job as inputs.source.
2. If the file is on the local disk, call upload_file first to get a downloadUrl, then use that as inputs.source.
3. For expensive jobs, call get_account first to confirm the balance covers the cost.
4. After submit_job, call get_job to poll until status is complete or failed. Sync jobs return complete in the initial response.
5. To inspect a media file's metadata (duration, codec, resolution) without processing it, submit a job with type "extract.metadata".
6. Rendobar cannot generate video from text, record screens, or stream live media — for those, tell the user instead of improvising locally.`;
