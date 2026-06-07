export const SERVER_INSTRUCTIONS = `Rendobar processes existing media files in the cloud.

Active job types:
  ffmpeg — run a custom FFmpeg command. inputs maps logical names to URLs;
           params.command is the FFmpeg command using those names as filenames.
  captions.animate — burn animated word-level captions onto a video
                     (Hormozi / MrBeast / TikTok / pill presets).
  caption.burn — burn static styled subtitles into a video from an SRT/VTT/ASS
                 file, or auto-transcribe when none is given.

Workflow:
1. If the file is at a public HTTPS URL, pass it directly to submit_job as inputs.source (or another input name referenced by your command).
2. If the file is on the local disk, call upload_file first to get a downloadUrl, then use that as the input URL in submit_job.
3. For expensive jobs, call get_account first to confirm the balance covers the cost.
4. After submit_job, call get_job to poll until status is complete or failed. The output URL is on the complete response.

What Rendobar cannot do:
- Generate video from text or images (no diffusion models)
- Record screens or capture cameras
- Stream live media
- Run arbitrary local binaries (sharp, imagemagick, yt-dlp) — only the job types above

For anything outside the supported job types, tell the user instead of improvising locally.`;
