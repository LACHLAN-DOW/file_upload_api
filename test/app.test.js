import { expect } from "chai";

import {
  fileTypeValidation,
  updateProgess,
  createSummary,
  mockValidateEmail,
  processCSV,
  taskStatusMap,
} from "../server.js"; 

describe("Validate File Type", () => {
  it("should return false for a valid CSV file", () => {
    const file = {
      originalname: "sample.csv",
      mimetype: "text/csv",
    };
    const result = fileTypeValidation(file);
    expect(result).to.be.false;
  });

  it("should return true for invalid file extension", () => {
    const file = {
      originalname: "sample.txt",
      mimetype: "text/plain",
    };
    const result = fileTypeValidation(file);
    expect(result).to.equal(true);
  });

  it("should return true for an invalid mime type", () => {
    const file = {
      originalname: "sample.csv",
      mimetype: "application/json",
    };
    const result = fileTypeValidation(file);
    expect(result).to.equal(true);
  });
});

describe("updateProgess", () => {
  it("should set the correct progress in taskStatusMap", () => {
    const uploadId = "97tyoegufvs8h8o4ting09sjtgp";
    const processedRecords = 76;
    const totalRecords = 89;

    updateProgess(uploadId, processedRecords, totalRecords);

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("processing");
    expect(statusEntry.progress).to.equal(85);
  });
  it("should set the correct progress in taskStatusMap at minimum boundries", () => {
    const uploadId = "sdfsdfsdfewrwer";
    const processedRecords = 0;
    const totalRecords = 1;

    updateProgess(uploadId, processedRecords, totalRecords);

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("processing");
    expect(statusEntry.progress).to.equal(0);
  });
  it("should set the correct progress in taskStatusMap with large total emails", () => {
    const uploadId = "97tyoegufvs8h8o4ting09sjtgp";
    const processedRecords = 900000;
    const totalRecords = 25248584;

    updateProgess(uploadId, processedRecords, totalRecords);

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("processing");
    expect(statusEntry.progress).to.equal(4);
  });
});

describe("createSummary", () => {
  it("should set the correct summary in taskStatusMap", () => {
    const uploadId = "sufhgdlifgndfgpijdrg";
    const totalRecords = 200;
    const results = [{
        "name": "Test Name",
        "email": "invalid-email",
        "error": "Invaid Email Format"
    }];

    createSummary(uploadId, totalRecords, results);
    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("completed");
    expect(statusEntry.progress).to.equal(100);
    expect(statusEntry.summary.totalRecords).to.equal(200);
    expect(statusEntry.summary.failedRecords).to.equal(1);
    expect(statusEntry.summary.processedRecords).to.equal(199);
    expect(statusEntry.summary.details).to.deep.equal(results);
  });
});

describe("mockValidateEmail", () => {
  it("should resolve to valid: true if the email contains '@'", async () => {
    const result = await mockValidateEmail("test@example.com");
    expect(result).to.deep.equal({ valid: true });
  });

  it("should resolve to valid: false if the email lacks '@'", async () => {
    const result = await mockValidateEmail("invalid-email");
    expect(result).to.deep.equal({ valid: false });
  });
});

