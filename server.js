//Imports
import express from "express";
import multer from "multer";
import csv_parser from "csv-parser";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import pLimit from "p-limit";


//constants
const upload = multer({ dest: "uploads/" });
const port = process.env.PORT || 3000;
const app = express();
const limit = pLimit(5);
const taskStatusMap = new Map();
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: "You have made too many uploads, please try again in a minute.",
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.post("/upload", uploadLimiter, upload.single("file"), (req, res) => {


  if (!req.file) {
    return res.status(400).send("No File Found");
  }

  const fileTypeError = fileTypeValidation(req.file);
  if(fileTypeError){
    fs.unlink(req.file.path, () => {}); // Delete the uploaded file
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

  fs.createReadStream(file.path)
    .pipe(csv_parser())
    .on("data", (data) => {
      totalRecords++;
      const validatePromise = limit(() =>
        mockValidateEmail(data.email)
        .then((validation) => {
          if (!validation.valid) {
            results.push({
              name: data.name,
              email: data.email,
              error: "Invaid Email Format",
            });
          }
          updateProgess(uploadId,++processedRecords,totalRecords);
          })
          .catch((error) => {
            results.push({
              name: data.name,
              email: data.email,
              error: "Validation service timed out",
            });
            updateProgess(uploadId,++processedRecords,totalRecords);
          })
      );
      validatePromises.push(validatePromise);
    })
    .on("end", async () => {
      await Promise.all(validatePromises);
      fs.unlink(file.path, () => {});
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
