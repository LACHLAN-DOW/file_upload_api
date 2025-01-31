import { expect } from "chai";
import sinon from "sinon";
import fs from "fs";
import csv_parser from "csv-parser";
import pLimit from "p-limit";
import { largeData } from "./largerDataFile.js";

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
    const results = [
      {
        name: "Test Name",
        email: "invalid-email",
        error: "Invaid Email Format",
      },
    ];

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

describe("processCSV", () => {
  let readStream;
  let pipeStub;
  let onStub;
  let unlinkStub;

  beforeEach(() => {
    pipeStub = sinon.stub().returnsThis();
    onStub = sinon.stub().callsFake(function (event, callback) {
        return this;
    });

    readStream = sinon.stub(fs, "createReadStream").returns({
      pipe: pipeStub,
      on: onStub,
    });

    unlinkStub = sinon.stub(fs, "unlink").callsFake((path, cb) => cb());
  });

  afterEach(() => {
    sinon.restore();
    taskStatusMap.clear();
  });

  it("should process CSV data for mixed results, update progress and create the correct summary", async () => {
    const uploadId = "k89345iuherdgy";
    const fakeFile = { path: "file.csv" };

    const rowData = [
      { name: "John Doe", email: "john@working.com" },
      { name: "Jane Doe", email: "janebroken.com" }, 
    ];

    const onCallMap = {};

    onStub.callsFake(function (event, callback) {
      onCallMap[event] = callback;
      return this;
    });

    processCSV(uploadId, fakeFile);

    rowData.forEach((row) => {
      onCallMap["data"](row);
    });

    await onCallMap["end"]();

    expect(readStream.calledOnceWithExactly(fakeFile.path)).to.be.true;

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("completed");
    expect(statusEntry.progress).to.equal(100);
    expect(statusEntry.summary.totalRecords).to.equal(2);
    expect(statusEntry.summary.failedRecords).to.equal(1);
    expect(statusEntry.summary.processedRecords).to.equal(1);

    expect(unlinkStub.calledOnceWithExactly(fakeFile.path, sinon.match.func)).to.be.true;
  });

  it("should process CSV data for all passing, update progress and create the correct summary", async () => {
    const uploadId = "sfgdfg";
    const fakeFile = { path: "file.csv" };

    const rowData = [
      { name: "John Doe", email: "john@working.com" },
      { name: "Jane Doe", email: "jane@alsoworking.com" }, 
    ];

    const onCallMap = {};

    onStub.callsFake(function (event, callback) {
      onCallMap[event] = callback;
      return this;
    });

    processCSV(uploadId, fakeFile);

    rowData.forEach((row) => {
      onCallMap["data"](row);
    });

    await onCallMap["end"]();

    expect(readStream.calledOnceWithExactly(fakeFile.path)).to.be.true;

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("completed");
    expect(statusEntry.progress).to.equal(100);
    expect(statusEntry.summary.totalRecords).to.equal(2);
    expect(statusEntry.summary.failedRecords).to.equal(0);
    expect(statusEntry.summary.processedRecords).to.equal(2);

    expect(unlinkStub.calledOnceWithExactly(fakeFile.path, sinon.match.func)).to.be.true;
  });

  it("should process CSV data for all failing, update progress and create the correct summary", async () => {
    const uploadId = "sfgdfg";
    const fakeFile = { path: "file.csv" };

    const rowData = [
      { name: "John Doe", email: "johnnotworking.com" },
      { name: "Jane Doe", email: "janealsonotworking.com" }, 
    ];

    const onCallMap = {};

    onStub.callsFake(function (event, callback) {
      onCallMap[event] = callback;
      return this;
    });

    processCSV(uploadId, fakeFile);

    rowData.forEach((row) => {
      onCallMap["data"](row);
    });

    await onCallMap["end"]();

    expect(readStream.calledOnceWithExactly(fakeFile.path)).to.be.true;

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("completed");
    expect(statusEntry.progress).to.equal(100);
    expect(statusEntry.summary.totalRecords).to.equal(2);
    expect(statusEntry.summary.failedRecords).to.equal(2);
    expect(statusEntry.summary.processedRecords).to.equal(0);

    expect(unlinkStub.calledOnceWithExactly(fakeFile.path, sinon.match.func)).to.be.true;
  });

  it("should process CSV data for all larger file, update progress and create the correct summary", async () => {
    const uploadId = "sfgdfg";
    const fakeFile = { path: "file.csv" };

    const rowData = largeData;

    const onCallMap = {};

    onStub.callsFake(function (event, callback) {
      onCallMap[event] = callback;
      return this;
    });

    processCSV(uploadId, fakeFile);

    rowData.forEach((row) => {
      onCallMap["data"](row);
    });

    await onCallMap["end"]();

    expect(readStream.calledOnceWithExactly(fakeFile.path)).to.be.true;

    const statusEntry = taskStatusMap.get(uploadId);
    expect(statusEntry.status).to.equal("completed");
    expect(statusEntry.progress).to.equal(100);
    expect(statusEntry.summary.totalRecords).to.equal(49);
    expect(statusEntry.summary.failedRecords).to.equal(24);
    expect(statusEntry.summary.processedRecords).to.equal(25);

    expect(unlinkStub.calledOnceWithExactly(fakeFile.path, sinon.match.func)).to.be.true;
  });
});
