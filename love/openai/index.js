const OpenAI = require("openai");

const OPENAI_API_KEY=process.env.OPENAI_API_KEY
const OPENAI_ASSISTANT_ID=process.env.OPENAI_ASSISTANT_ID

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function createThread() {
  console.log("[DEBUG] Creating a new thread");
  const thread = await openai.beta.threads.create();
  console.log(`[DEBUG] Created thread with ID: ${thread.id}`);
  return thread.id;
}

async function addUserMessage(threadId, contentObj) {
  const content = JSON.stringify(contentObj).slice(0, 255000); // Truncate to avoid length errors
  console.log("[DEBUG] Adding user message to thread");
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content,
  });
  console.log("[DEBUG] User message added to thread");
}

async function runThread(threadId) {
  console.log("[DEBUG] Running thread");
  // We use the stream SDK helper to create a run with
  // streaming. The SDK provides helpful event listeners to handle 
  // the streamed response.

  let stream = await openai.beta.threads.runs.create(
    threadId,
    { 
      stream: true,
      assistant_id: OPENAI_ASSISTANT_ID,
    }
  );

  let accumulatedText = '';

  for await (const event of stream) {
    const newText = event.data.delta?.content[0]?.text?.value || '';
    accumulatedText += newText;
    process.stdout.write(`\r${accumulatedText}`);
  }

  // let messages
  // while (stream.status !== 'completed') {
  //   if (stream.status === 'completed') {
  //     messages = await openai.beta.threads.messages.list(
  //       stream.thread_id
  //     );
  //     for (const message of messages.data.reverse()) {
  //       console.log('message', message);
  //     }
  //   } else {
  //     console.log(stream);
  //   }
  // }

  console.log("[DEBUG] Thread run completed, fetching assistant response");
  const threadMessages = await openai.beta.threads.messages.list(threadId);
  console.log('THREAD MESSAGES', threadMessages)
  const assistantMessage = threadMessages.data.find((m) => m.role === "assistant");
  if (!assistantMessage) {
    console.error("[ERROR] Assistant response not found in run");
    throw new Error("Assistant response not found");
  }

  //console.log('ASSISTANT MESSAGE', assistantMessage)

  //console.log("[DEBUG] Parsing assistant response");
  //console.log(assistantMessage.content[0].text);
  return true;
}