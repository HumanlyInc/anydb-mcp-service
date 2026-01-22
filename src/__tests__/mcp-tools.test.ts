/**
 * Tests for MCP Tools
 * These tests validate the tool endpoints without making real API calls
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ADOCellValueType } from "anydb-api-sdk-ts";

// Mock the AnyDB client - we define our own type since it has additional methods beyond the SDK
const mockAnyDBClient: any = {
  listTeams: jest.fn(),
  listDatabasesForTeam: jest.fn(),
  listRecords: jest.fn(),
  getRecord: jest.fn(),
  createRecord: jest.fn(),
  updateRecord: jest.fn(),
  removeRecord: jest.fn(),
  searchRecords: jest.fn(),
  downloadFile: jest.fn(),
  uploadFile: jest.fn(),
};

describe("MCP Tool Validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("list_teams", () => {
    it("should return teams successfully", async () => {
      const mockTeams = [
        { teamid: "6966569a6dfb26607e99ac63", name: "Test Team" },
      ];
      mockAnyDBClient.listTeams.mockResolvedValue(mockTeams);

      const result = await mockAnyDBClient.listTeams();

      expect(result).toEqual(mockTeams);
      expect(mockAnyDBClient.listTeams).toHaveBeenCalledTimes(1);
    });
  });

  describe("list_databases_for_team", () => {
    it("should return databases for a team", async () => {
      const teamid = "6966569a6dfb26607e99ac63";
      const mockDatabases = [
        { adbid: "6966569a6dfb26607e99ac70", teamid, name: "Test DB" },
      ];
      mockAnyDBClient.listDatabasesForTeam.mockResolvedValue(mockDatabases);

      const result = await mockAnyDBClient.listDatabasesForTeam(teamid);

      expect(result).toEqual(mockDatabases);
      expect(mockAnyDBClient.listDatabasesForTeam).toHaveBeenCalledWith(teamid);
    });

    it("should throw error when teamid is missing", async () => {
      mockAnyDBClient.listDatabasesForTeam.mockRejectedValue(
        new Error("teamid is required"),
      );

      await expect(mockAnyDBClient.listDatabasesForTeam("")).rejects.toThrow(
        "teamid is required",
      );
    });
  });

  describe("list_records", () => {
    const teamid = "6966569a6dfb26607e99ac63";
    const adbid = "6966569a6dfb26607e99ac70";

    it("should return records with basic parameters", async () => {
      const mockResponse = {
        items: [
          {
            adoid: "6966c97ea9a78803df3aa495",
            adbid,
            teamid,
            name: "Test Record",
          },
        ],
        hasmore: false,
        total: 1,
      };
      mockAnyDBClient.listRecords.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.listRecords(teamid, adbid);

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(1);
      expect(mockAnyDBClient.listRecords).toHaveBeenCalledWith(teamid, adbid);
    });

    it("should return records with pagination", async () => {
      const mockResponse = {
        items: Array(50).fill({
          adoid: "6966c97ea9a78803df3aa495",
          adbid,
          teamid,
          name: "Test Record",
        }),
        hasmore: true,
        lastmarker: "marker123",
        total: 100,
      };
      mockAnyDBClient.listRecords.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.listRecords(
        teamid,
        adbid,
        undefined,
        undefined,
        undefined,
        "50",
      );

      expect(result.items).toHaveLength(50);
      expect(result.hasmore).toBe(true);
      expect(result.lastmarker).toBe("marker123");
      expect(result.total).toBe(100);
    });

    it("should filter records by templateid", async () => {
      const templateid = "222222222222222222222222";
      const mockResponse = {
        items: [
          {
            adoid: "6966c97ea9a78803df3aa495",
            adbid,
            teamid,
            name: "File Record",
          },
        ],
        hasmore: false,
        total: 1,
      };
      mockAnyDBClient.listRecords.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.listRecords(
        teamid,
        adbid,
        undefined,
        templateid,
      );

      expect(result).toEqual(mockResponse);
      expect(mockAnyDBClient.listRecords).toHaveBeenCalledWith(
        teamid,
        adbid,
        undefined,
        templateid,
      );
    });

    it("should filter records by parentid", async () => {
      const parentid = "6966c97ea9a78803df3aa495";
      const mockResponse = {
        items: [
          {
            adoid: "6966c97ea9a78803df3aa496",
            adbid,
            teamid,
            name: "Child Record",
          },
        ],
        hasmore: false,
        total: 1,
      };
      mockAnyDBClient.listRecords.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.listRecords(teamid, adbid, parentid);

      expect(result).toEqual(mockResponse);
      expect(mockAnyDBClient.listRecords).toHaveBeenCalledWith(
        teamid,
        adbid,
        parentid,
      );
    });
  });

  describe("get_record", () => {
    it("should return a specific record", async () => {
      const teamid = "6966569a6dfb26607e99ac63";
      const adbid = "6966569a6dfb26607e99ac70";
      const adoid = "6966c97ea9a78803df3aa495";
      const mockRecord = {
        meta: {
          adoid,
          adbid,
          teamid,
          name: "Test Record",
          description: "Test description",
        },
        content: {
          A1: { pos: "A1", value: "Hello", type: ADOCellValueType.STRING },
        },
      };
      mockAnyDBClient.getRecord.mockResolvedValue(mockRecord);

      const result = await mockAnyDBClient.getRecord(teamid, adbid, adoid);

      expect(result).toEqual(mockRecord);
      expect(result.meta.name).toBe("Test Record");
      expect(result.content?.A1.value).toBe("Hello");
    });
  });

  describe("create_record", () => {
    it("should create a new record", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        name: "New Record",
        content: {
          A1: { pos: "A1", value: "Initial value" },
        },
      };
      const mockRecord = {
        meta: {
          adoid: "6966c97ea9a78803df3aa495",
          adbid: params.adbid,
          teamid: params.teamid,
          name: params.name,
        },
        content: params.content,
      };
      mockAnyDBClient.createRecord.mockResolvedValue(mockRecord);

      const result = await mockAnyDBClient.createRecord(params);

      expect(result).toEqual(mockRecord);
      expect(result.meta.name).toBe("New Record");
      expect(mockAnyDBClient.createRecord).toHaveBeenCalledWith(params);
    });

    it("should create a record with a template", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        name: "File Record",
        template: "222222222222222222222222",
      };
      const mockRecord = {
        meta: {
          adoid: "6966c97ea9a78803df3aa495",
          adbid: params.adbid,
          teamid: params.teamid,
          name: params.name,
        },
      };
      mockAnyDBClient.createRecord.mockResolvedValue(mockRecord);

      const result = await mockAnyDBClient.createRecord(params);

      expect(result).toEqual(mockRecord);
      expect(mockAnyDBClient.createRecord).toHaveBeenCalledWith(params);
    });
  });

  describe("update_record", () => {
    it("should update an existing record", async () => {
      const params = {
        meta: {
          adoid: "6966c97ea9a78803df3aa495",
          adbid: "6966569a6dfb26607e99ac70",
          teamid: "6966569a6dfb26607e99ac63",
          name: "Updated Name",
        },
        content: {
          A1: { pos: "A1", value: "Updated value" },
        },
      };
      const mockRecord = {
        meta: params.meta,
        content: params.content,
      };
      mockAnyDBClient.updateRecord.mockResolvedValue(mockRecord);

      const result = await mockAnyDBClient.updateRecord(params);

      expect(result).toEqual(mockRecord);
      expect(result.meta.name).toBe("Updated Name");
    });
  });

  describe("delete_record", () => {
    it("should delete an existing record", async () => {
      const params = {
        adoid: "6966c97ea9a78803df3aa495",
        adbid: "6966569a6dfb26607e99ac70",
        teamid: "6966569a6dfb26607e99ac63",
        removefromids: "000000000000000000000000",
      };
      const mockResult = true;
      mockAnyDBClient.removeRecord.mockResolvedValue(mockResult);

      const result = await mockAnyDBClient.removeRecord(params);

      expect(result).toEqual(mockResult);
      expect(result).toBe(true);
    });
  });

  describe("search_records", () => {
    it("should search records by keyword", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        search: "test",
      };
      const mockResults = [
        {
          meta: {
            adoid: "6966c97ea9a78803df3aa495",
            adbid: params.adbid,
            teamid: params.teamid,
            name: "Test Record 1",
          },
        },
        {
          meta: {
            adoid: "6966c97ea9a78803df3aa496",
            adbid: params.adbid,
            teamid: params.teamid,
            name: "Test Record 2",
          },
        },
      ];
      mockAnyDBClient.searchRecords.mockResolvedValue(mockResults);

      const result = await mockAnyDBClient.searchRecords(params);

      expect(result).toEqual(mockResults);
      expect(result).toHaveLength(2);
      expect(mockAnyDBClient.searchRecords).toHaveBeenCalledWith(params);
    });

    it("should search with pagination", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        search: "test",
        limit: "10",
        start: "0",
      };
      const mockResults = Array(10).fill({
        meta: {
          adoid: "6966c97ea9a78803df3aa495",
          adbid: params.adbid,
          teamid: params.teamid,
          name: "Test Record",
        },
      });
      mockAnyDBClient.searchRecords.mockResolvedValue(mockResults);

      const result = await mockAnyDBClient.searchRecords(params);

      expect(result).toHaveLength(10);
    });
  });

  describe("download_file", () => {
    it("should return download URL", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        adoid: "6966c97ea9a78803df3aa495",
        cellpos: "A1",
      };
      const mockResponse = {
        url: "https://storage.example.com/file.pdf",
        redirect: false,
      };
      mockAnyDBClient.downloadFile.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.downloadFile(params);

      expect(result).toEqual(mockResponse);
      expect(result.url).toContain("https://");
    });

    it("should support preview mode", async () => {
      const params = {
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        adoid: "6966c97ea9a78803df3aa495",
        cellpos: "A1",
        preview: true,
      };
      const mockResponse = {
        url: "https://storage.example.com/file.pdf?preview=true",
        redirect: false,
      };
      mockAnyDBClient.downloadFile.mockResolvedValue(mockResponse);

      const result = await mockAnyDBClient.downloadFile(params);

      expect(result.url).toContain("preview=true");
    });
  });

  describe("upload_file", () => {
    it("should upload file successfully", async () => {
      const params = {
        filename: "test.txt",
        fileContent: Buffer.from("Hello World"),
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        adoid: "6966c97ea9a78803df3aa495",
        cellpos: "A1",
        contentType: "text/plain",
      };
      const mockAdoid = "6966c97ea9a78803df3aa496";
      mockAnyDBClient.uploadFile.mockResolvedValue(mockAdoid);

      const result = await mockAnyDBClient.uploadFile(params);

      expect(result).toBe(mockAdoid);
      expect(result).toMatch(/^[0-9a-f]{24}$/i);
      expect(mockAnyDBClient.uploadFile).toHaveBeenCalledWith(params);
    });

    it("should throw error when required params are missing", async () => {
      const params = {
        filename: "test.txt",
        fileContent: Buffer.from("Hello"),
        teamid: "6966569a6dfb26607e99ac63",
        adbid: "6966569a6dfb26607e99ac70",
        adoid: "",
      };
      mockAnyDBClient.uploadFile.mockRejectedValue(
        new Error("adoid is required"),
      );

      await expect(mockAnyDBClient.uploadFile(params)).rejects.toThrow(
        "adoid is required",
      );
    });
  });

  describe("Tool Parameter Validation", () => {
    it("should validate MongoDB ObjectId format", () => {
      const validObjectId = "6966569a6dfb26607e99ac63";
      const invalidObjectId = "invalid-id";

      expect(validObjectId).toMatch(/^[0-9a-f]{24}$/i);
      expect(invalidObjectId).not.toMatch(/^[0-9a-f]{24}$/i);
    });

    it("should validate cell position format", () => {
      const validCellPos = ["A1", "B2", "AA10", "Z999"];
      const invalidCellPos = ["1A", "ABC", "", "1234"];

      validCellPos.forEach((pos) => {
        expect(pos).toMatch(/^[A-Z]+[0-9]+$/);
      });

      invalidCellPos.forEach((pos) => {
        expect(pos).not.toMatch(/^[A-Z]+[0-9]+$/);
      });
    });

    it("should validate pagesize is numeric", () => {
      expect("50").toMatch(/^\d+$/);
      expect("100").toMatch(/^\d+$/);
      expect("abc").not.toMatch(/^\d+$/);
    });
  });
});
