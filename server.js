const express = require("express");
const multer = require("multer");
const csv_parser = require("csv-parser");
const app = express();
const fs = require("fs");
//const pLimit = require('p-limit');
const upload = multer({ dest: "uploads/" });
const port = process.env.PORT || 3000;
const { v4: uuidv4 } = require("uuid"); // For generating unique upload IDs


//const limit = pLimit(5);

const taskStatusMap = new Map();
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No File Found");
  }

  const uploadId = uuidv4(); 
  taskStatusMap.set(uploadId, { status: "processing", progress: 0 });
  res.status(200).json({
    uploadId,
    message: "File uploaded successfully. Processing started.",
  });

  const results = [];
  const validatePromises = [];
  let totalRecords = 0;
  fs.createReadStream(req.file.path)
    .pipe(csv_parser())
    .on("data", (data) =>  {
        totalRecords++;
        const validatePromise = mockValidateEmail(data.email).then((validation) =>{
            if(!validation.valid){
                results.push({name:data.name,email: data.email, error:'Invaid Email Format'});
            }
            
        const progress = Math.round((validatePromises.length / totalRecords) * 100);
        taskStatusMap.set(uploadId, { status: "processing", progress });
        })
        validatePromises.push(validatePromise)
    })
    .on("end", async () => {
        await Promise.all(validatePromises); 
        fs.unlink(req.file.path, () => {}); 
        const summary = 
        {
            totalRecords: totalRecords,
            processedRecords: totalRecords - results.length,
            failedRecords: results.length,
            details:results
        } 
        taskStatusMap.set(uploadId, { status: "completed", progress: 100, summary });

    });
});

app.get("/status/:uploadId", (req, res) => {
    const { uploadId } = req.params;
    const status = taskStatusMap.get(uploadId);
  
    if (!status) {
      return res.status(404).json({ error: "Upload ID not found" });
    }
  
    res.status(200).json(status);
  });

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
