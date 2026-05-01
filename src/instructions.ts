export const SERVER_INSTRUCTIONS = `Rendobar processes existing media files via FFmpeg in the cloud.

Active job type:
  raw.ffmpeg — run a custom FFmpeg command. inputs maps logical names to URLs;
               params.command is the FFmpeg command using those names as filenames.

Workflow:
1. If the file is at a public HTTPS URL, pass it directly to submit_job as inputs.source (or another input name referenced by your command).
2. If the file is on the local disk, call upload_file first to get a downloadUrl, then use that as the input URL in submit_job.
3. For expensive jobs, call get_account first to confirm the balance covers the cost.
4. After submit_job, call get_job to poll until status is complete or failed. The output URL is on the complete response.

What Rendobar cannot do:
- Generate video from text or images (no diffusion models)
- Record screens or capture cameras
- Stream live media
- Run other binaries (ffprobe, sharp, imagemagick) — only ffmpeg

For anything outside FFmpeg, tell the user instead of improvising locally.`;
