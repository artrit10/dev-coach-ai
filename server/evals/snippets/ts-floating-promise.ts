type Job = { id: string };

async function sendEmail(job: Job): Promise<void> {
  await fetch("https://mail.example.com/send", { method: "POST", body: JSON.stringify(job) });
}

export async function processJobs(jobs: Job[]) {
  jobs.forEach(async (job) => {
    await sendEmail(job);
  });
  console.log("All emails sent");
}
