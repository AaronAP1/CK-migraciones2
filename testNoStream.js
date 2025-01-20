const mysql = require("mysql2/promise");
const XLSX = require("xlsx");
const OpenAI = require("openai");

const ID_CLINICA=65
const ID_SUPER_CLINICA=49
const LOT_SIZE=10
const MYSQL_DB=process.env.MYSQL_DB
const MYSQL_HOST=process.env.MYSQL_HOST
const MYSQL_PASSWORD=process.env.MYSQL_PASSWORD
const MYSQL_USER=process.env.MYSQL_USER
const OPENAI_API_KEY=process.env.OPENAI_API_KEY
const OPENAI_ASSISTANT_ID=process.env.OPENAI_ASSISTANT_ID

const body = JSON.stringify({
  "fileToBase64": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,[BASE 64 DEL EXCEL A RECONOCER...]"
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

let pool;
function getDbPool() {
  if (!pool) {
    console.log("[DEBUG] Initializing MySQL pool");
    pool = mysql.createPool({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DB,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

async function getCatalogData() {
  console.log("[DEBUG] Fetching catalog data");
  const dbPool = getDbPool();
  const conn = await dbPool.getConnection();
  try {
    const [pacientes] = await conn.query(
      `SELECT id_paciente, CONCAT(nombre, ' ', apellido) AS nombre_completo FROM pacientes WHERE id_clinica = ? AND id_super_clinica = ? LIMIT 1000`,
      [ID_CLINICA, ID_SUPER_CLINICA]
    );
    console.log(`[DEBUG] Fetched ${pacientes.length} pacientes`);

    const [medicos] = await conn.query(
      `SELECT id_medico, CONCAT(nombre_medico, ' ', apellido_medico) AS nombre_completo FROM medicos WHERE id_clinica = ? AND id_super_clinica = ? LIMIT 1000`,
      [ID_CLINICA, ID_SUPER_CLINICA]
    );
    console.log(`[DEBUG] Fetched ${medicos.length} medicos`);

    const [espacios] = await conn.query(
      `SELECT id_espacio, nombre FROM espacios WHERE id_clinica = ? AND id_super_clinica = ? LIMIT 1000`,
      [ID_CLINICA, ID_SUPER_CLINICA]
    );
    console.log(`[DEBUG] Fetched ${espacios.length} espacios`);

    const [tratamientos] = await conn.query(
      `SELECT id_tratamiento, nombre_tratamiento FROM tratamientos WHERE id_clinica = ? AND id_super_clinica = ? LIMIT 1000`,
      [ID_CLINICA, ID_SUPER_CLINICA]
    );
    console.log(`[DEBUG] Fetched ${tratamientos.length} tratamientos`);

    return { pacientes, medicos, espacios, tratamientos };
  } catch (error) {
    console.error("[ERROR] Failed to fetch catalog data", error);
    throw error;
  } finally {
    conn.release();
  }
}

function parseExcelFromBase64(fileToBase64) {
  console.log("[DEBUG] Decoding and parsing Excel file");
  const prefix = "base64,";
  const base64Data = fileToBase64.includes(prefix)
    ? fileToBase64.split(prefix)[1]
    : fileToBase64;
  const buffer = Buffer.from(base64Data, "base64");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  const excelArray = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null });
  console.log(`[DEBUG] Parsed ${excelArray.length} rows from Excel`);
  return excelArray;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  console.log(`[DEBUG] Divided data into ${chunks.length} chunks of size ${size}`);
  return chunks;
}

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

  

  const run = await openai.beta.threads.runs.create(
    threadId,
    { assistant_id: OPENAI_ASSISTANT_ID }
  );

  console.log(run);

  let messages
  while (run.status !== 'completed') {
    if (run.status === 'completed') {
      messages = await openai.beta.threads.messages.list(
        run.thread_id
      );
      for (const message of messages.data.reverse()) {
        console.log('message', message);
      }
    } else {
      console.log(run.status);
    }
  }

  console.log("[DEBUG] Thread run completed, fetching assistant response");
  const threadMessages = await openai.beta.threads.messages.list(threadId);
  console.log('THREAD MESSAGES', threadMessages)
  const assistantMessage = threadMessages.data.find((m) => m.role === "assistant");
  if (!assistantMessage) {
    console.error("[ERROR] Assistant response not found in run");
    throw new Error("Assistant response not found");
  }

  console.log('ASSISTANT MESSAGE', assistantMessage)

  console.log("[DEBUG] Parsing assistant response");
  console.log(assistantMessage.content[0].text);
  return true;
}



const handler = async () => {
  const event = {
    isBase64Encoded: false,
    body,
  }
  console.log("[DEBUG] Lambda invoked");
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    const { fileToBase64 } = JSON.parse(rawBody);

    if (!fileToBase64) {
      console.error("[ERROR] Missing fileToBase64 in request body");
      return { statusCode: 400, body: JSON.stringify({ error: "Missing fileToBase64" }) };
    }

    const excelArray = parseExcelFromBase64(fileToBase64);
    const catalogs = await getCatalogData();
    const lotSize = parseInt(LOT_SIZE || "100", 10);
    const batches = chunkArray(excelArray, lotSize);

    const threadId = await createThread();
    let finalResult = [];

    for (const batch of batches) {
      console.log(`[DEBUG] Processing batch of size ${batch.length}`);
      const contentObj = {
        catalogs: {
          pacientes: catalogs.pacientes.slice(0, 500),
          medicos: catalogs.medicos.slice(0, 500),
          espacios: catalogs.espacios.slice(0, 500),
          tratamientos: catalogs.tratamientos.slice(0, 500),
        },
        excelData: batch,
        estados_cita: {
          1: "Programado",
          2: "Cancelado",
          3: "Terminado",
          4: "Bloqueado",
          5: "Ausente",
          6: "Eliminado",
          7: "Reprogramado",
        },
      };

      await addUserMessage(threadId, contentObj);
      const batchResult = await runThread(threadId);
      finalResult = finalResult.concat(batchResult.resultados || batchResult);
    }

    console.log(`[DEBUG] Processed ${finalResult.length} results`);
    return {
      statusCode: 200,
      body: JSON.stringify({ finalResult }),
    };
  } catch (error) {
    console.error("[ERROR] Unexpected error in Lambda", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

handler();
