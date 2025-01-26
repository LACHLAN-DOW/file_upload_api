const express = require("express");
const multer = require("multer");
const csv_parser = require("csv-parser");
const app = express();
const fs = require("fs");
const upload = multer({ dest: "uploads/" });
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No File Found");
  }
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
            details:[results]
        } 
        res.status(200).json(summary); 
    });
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
