import { describe, expect, it } from "vitest";
import { paisPeloTelefone } from "./phone";

describe("paisPeloTelefone", () => {
  it("reconhece Portugal pelo código", () => {
    expect(paisPeloTelefone("+351 21 848 5555")).toBe("PT");
    expect(paisPeloTelefone("00351912345678")).toBe("PT");
    expect(paisPeloTelefone("351912345678")).toBe("PT");
  });
  it("reconhece Brasil pelo código", () => {
    expect(paisPeloTelefone("+55 43 99999-1234")).toBe("BR");
    expect(paisPeloTelefone("5543999991234")).toBe("BR");
  });
  it("sem código não chuta", () => {
    expect(paisPeloTelefone("(43) 99999-1234")).toBeNull();
    expect(paisPeloTelefone("912 345 678")).toBeNull();
    expect(paisPeloTelefone(null)).toBeNull();
  });
});
