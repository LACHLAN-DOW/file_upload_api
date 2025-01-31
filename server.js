//Imports
import express from "express";
import multer from "multer";
import csv_parser from "csv-parser";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import pLimit from "p-limit";
import winston from "winston";


//constants
const upload = multer({ dest: "uploads/" });
const port = process.env.PORT || 3000;
const app = express();
const CON_CONCURRENCY_LIMIT = 5
const limit = pLimit(CON_CONCURRENCY_LIMIT);
const taskStatusMap = new Map();
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: "You have made too many uploads, please try again in a minute.",
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "email_validation_api.log" }),
  ],
})

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.post("/upload", uploadLimiter, upload.single("file"), (req, res) => {


  if (!req.file) {
    return res.status(400).send("No File Found");
  }

  const fileTypeError = fileTypeValidation(req.file);
  if(fileTypeError){
    fs.unlink(req.file.path, () => {});
    return res
    .status(400)
    .send("Invalid file extension. Only CSV files are allowed.");
  }

  const uploadId = uuidv4();
  updateProgess(uploadId,0,1);

  res.status(200).json({uploadId,message: "File uploaded successfully. Processing started."});
  processCSV(uploadId,req.file);
});

app.get("/status/:uploadId", (req, res) => {
  const { uploadId } = req.params;
  const status = taskStatusMap.get(uploadId);

  if (!status) {
    return res.status(404).json({ error: "Upload ID not found" });
  }

  res.status(200).json(status);
});

const fileTypeValidation = (file) =>{
  //check extension
  const fileExtension = file.originalname.slice(-4);
  if (fileExtension !== ".csv") {
    return true;
  }

  //mime type check
  const mimeType = file.mimetype;
  if (mimeType !== "text/csv") {
    return true;
  }
  return false;
}

const updateProgess = (uploadId, processedRecords,totalRecords) => {
  const progress = Math.round((processedRecords / totalRecords) * 100);
  taskStatusMap.set(uploadId, { status: "processing", progress });
}

const createSummary = (uploadId,totalRecords,results) =>{
  const summary = {
    totalRecords: totalRecords,
    processedRecords: totalRecords - results.length,
    failedRecords: results.length,
    details: results,
  };
  taskStatusMap.set(uploadId, {
    status: "completed",
    progress: 100,
    summary,
  });
}

const processCSV = (uploadId, file) =>{
  const results = [];
  const validatePromises = [];
  let totalRecords = 0;
  let processedRecords = 0;
  const stream = fs.createReadStream(file.path).pipe(csv_parser());

    stream.on("data", (data) => {
      if (limit.activeCount >= CON_CONCURRENCY_LIMIT) {
        stream.pause();
      }
      totalRecords++;
      logger.info(`Begin Email Validation: ${data.email}`, { uploadId, email: data.email });
      const validatePromise = limit(() =>
        mockValidateEmail(data.email)
        .then((validation) => {
          if (!validation.valid) {
            results.push({
              name: data.name,
              email: data.email,
              error: "Invaid Email Format",
            });
            logger.warn(`Failed Email Validation: ${data.email}`, { uploadId, email: data.email });

          }else{
            logger.info(`Successful Email Validation: ${data.email}`, { uploadId, email: data.email });

          }
          updateProgess(uploadId,++processedRecords,totalRecords);
          })
          .catch((error) => {
            const errorMessage = "Validation service timed out";
            results.push({
              name: data.name,
              email: data.email,
              error: errorMessage,
            });
            logger.error(`Error for ${data.email}: ${error.message}`, {
              uploadId,
              email: data.email,
              error: errorMessage,
            });
            updateProgess(uploadId,++processedRecords,totalRecords);
          })
      ).finally(()=>{
        if (limit.activeCount < CON_CONCURRENCY_LIMIT) {
          stream.resume();
        }
      });
      validatePromises.push(validatePromise);
    })
    .on("end", async () => {
      await Promise.all(validatePromises);
      fs.unlink(file.path, () => {});
      logger.info(`Processing completed: ${uploadId}`, {
        uploadId,
        totalRecords,
        invalidEmails: results.length,
      });
      createSummary( uploadId,totalRecords,results)
    });
}

const mockValidateEmail = async (email) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (email.includes("@")) {
        resolve({ valid: true });
      } else {
        resolve({ valid: false });
      }
    }, 100);
  });
};

export {
  fileTypeValidation,
  updateProgess,
  createSummary,
  mockValidateEmail,
  processCSV,
  taskStatusMap
} 
