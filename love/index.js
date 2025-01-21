// LA IDEA EN ESTA LÓGICA ES USAR UN JSON X QUE SIRVA COMO UN MAPA QUE PERMITA TRADUCIR EL EXCEL A UNA ESTRUCTURA ACORDE A LA BASE DE DATOS, EN ESTE CASO A LA TABLA PACIENTES
// NOTA: AÚN NO SE ESTÁ VALIDANDO QUE EL JSON DE SALIDA NO CONTEMPLE REGISTROS DUPLICADOS

// EJECUTAR CON "node love/index.js"

const jsonX = {
  mapa_campos: {
      "Nombre": "nombre",
      "Apellidos": "apellido",
      "E-Mail": "email",
      "Teléfono": "telefono",
      "Telefono2": "telefono",
      "F.Nacimiento": "fecha_nacimiento",
      "Dirección": "direccion",
      "Población": "ciudad",
      "CodPostal": "codigo_postal",
      "CIF": "nif_cif",
      "Fecha de alta": "fecha_alta",
      "Sexo": "id_sexo",
      "Firma LOPD": "lopd_aceptado"
  },
  valores_por_defecto: {
      "codigo_postal": "0",
      "nif_cif": "0",
      "lopd_aceptado": "0"
  },
  transformaciones: {
      fecha_nacimiento: (value) => (value === "0000-00-00" ? null : value),
      telefono: (value, item) => value || item["Telefono2"] || "0",
      id_sexo: (value) => {
          const sexoMap = {
              "H": 1, // Hombre
              "M": 2, // Mujer
              "Indiferente": 3,
              "": null // Vacío o no especificado
          };
          return sexoMap[value] || null;
      }
  }
};

const xlsx = require("xlsx");

/**
 * Lee un archivo Excel y lo convierte en un array de JSONs ("JSON A").
 * @param {string} filePath - Ruta del archivo Excel.
 * @returns {Array} Lista de objetos JSON representando las filas del Excel.
 */
function leerExcelComoJSON(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Usa la primera hoja del archivo
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet);
}

/**
 * Transforma una lista de JSONs A en JSONs C utilizando un mapa definido (JSON X).
 * @param {Array} jsonA - Lista de JSONs generados del Excel.
 * @param {Object} jsonX - JSON X con el mapeo, valores por defecto y reglas de transformación.
 * @returns {Array} Lista de JSONs C preparados para la migración.
 */
function transformarJSONA(jsonA, jsonX) {
    return jsonA.map((item) => {
        let jsonC = {};
        for (let [keyA, keyC] of Object.entries(jsonX.mapa_campos)) {
            let value = item[keyA];

            // Aplicar transformación si existe una función de transformación
            if (jsonX.transformaciones[keyC]) {
                value = jsonX.transformaciones[keyC](value, item);
            }

            // Usar valores por defecto si no hay datos válidos
            jsonC[keyC] = value || jsonX.valores_por_defecto[keyC] || null;
        }
        return jsonC;
    });
}

// Ejemplo de uso
const rutaExcel = "./input_files/excel/pacientes.xls"; // Ruta del archivo Excel
const jsonA = leerExcelComoJSON(rutaExcel); // Leer Excel como JSON A
const jsonC = transformarJSONA(jsonA, jsonX); // Transformar JSON A a JSON C

console.log(jsonC);
