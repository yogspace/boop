import { strToU8, zipSync } from "fflate";
import { hexOf } from "@/features/calendar/palette";
import type { StickerInput } from "./build";
import { stampMesh } from "./export-stl";

/**
 * The stamp as a 3MF, written the way Bambu Studio saves a project: opened,
 * it is ready to slice. The settings in bambu-a1.json are Bambu Studio's
 * own system presets, resolved into one project – an A1 with a 0.4 mm
 * nozzle, 0.20 mm Standard, Bambu PLA Basic on the Textured PEI Plate; this
 * is the version they came from. The stamp stands on its rubber in the
 * middle of the plate, as in the STL (export-stl.ts).
 */
const BAMBU_VERSION = "02.08.02.61";
/** The A1's plate is this wide each way (mm). */
const PLATE = 256;

// Bambu Studio numbers its UUIDs by object – the same in every project.
const UUID = {
  object: "00000001-61cb-4c03-9d28-80fed5dfa1dc",
  component: "00010000-b206-40ff-9872-83e8017abed1",
  mesh: "00010000-81cb-4c03-9d28-80fed5dfa1dc",
  item: "00000002-b1ec-4553-aec9-835e5b724bb4",
  build: "2c7c17d8-22b5-4d84-8835-1976022ea369",
};

const XML = `<?xml version="1.0" encoding="UTF-8"?>`;
const MODEL = `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">`;
const MODEL_REL =
  "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

const CONTENT_TYPES = `${XML}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;

const rels = (thumbnails: boolean) => `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="${MODEL_REL}"/>${
   thumbnails
     ? `
 <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
 <Relationship Target="/Metadata/plate_1.png" Id="rel-4" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-middle"/>
 <Relationship Target="/Metadata/plate_1_small.png" Id="rel-5" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-small"/>`
     : ""
 }
</Relationships>`;

const MODEL_RELS = `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="${MODEL_REL}"/>
</Relationships>`;

const SLICE_INFO = `${XML}
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="${BAMBU_VERSION}"/>
  </header>
</config>`;

const CUT_INFORMATION = `<?xml version="1.0" encoding="utf-8"?>
<objects>
 <object id="1">
  <cut_id id="0" check_sum="1" connectors_cnt="0"/>
 </object>
</objects>`;

const FILAMENT_SEQUENCE = JSON.stringify({
  plate_1: { nozzle_sequence: [], optimal_assignment: [], sequence: [] },
});

const round = (value: number) => Math.round(value * 1e4) / 1e4;

const xmlText = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The stamp as a Bambu Studio project, named `title`, in a filament of its
 * own color. `picture` (a PNG) is the project's thumbnail – none without.
 */
export const stampThreeMf = async (
  input: StickerInput,
  title: string,
  picture: Uint8Array | null = null
): Promise<Blob> => {
  const { positions, indices } = await stampMesh(input);
  const name = xmlText(title);
  const date = new Date().toISOString().slice(0, 10);

  // The mesh sits around its own middle, as Bambu Studio keeps it; the
  // build puts it in the middle of the plate, on it.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length; v += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], positions[v + axis]);
      max[axis] = Math.max(max[axis], positions[v + axis]);
    }
  }
  const [cx, cy, cz] = min.map((low, axis) => round((low + max[axis]) / 2));
  const faces = indices.length / 3;

  const object = [
    XML,
    MODEL,
    ` <metadata name="BambuStudio:3mfVersion">1</metadata>`,
    ` <resources><object id="1" p:UUID="${UUID.mesh}" type="model"><mesh><vertices>`,
  ];
  for (let v = 0; v < positions.length; v += 3) {
    object.push(
      `<vertex x="${round(positions[v] - cx)}" y="${round(positions[v + 1] - cy)}" z="${round(positions[v + 2] - cz)}"/>`
    );
  }
  object.push("</vertices><triangles>");
  for (let t = 0; t < indices.length; t += 3) {
    object.push(
      `<triangle v1="${indices[t]}" v2="${indices[t + 1]}" v3="${indices[t + 2]}"/>`
    );
  }
  object.push(
    "</triangles></mesh></object></resources>",
    " <build/>",
    "</model>"
  );

  const metadata = {
    Copyright: "",
    CreationDate: date,
    Description: "",
    Designer: "",
    DesignerCover: "",
    DesignerUserId: "",
    License: "",
    ModificationDate: date,
    Origin: "",
    ProfileCover: "",
    ProfileDescription: "",
    ProfileTitle: "",
    Title: name,
  };
  const model = `${XML}
${MODEL}
 <metadata name="Application">BambuStudio-${BAMBU_VERSION}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
${Object.entries(metadata)
  .map(([key, value]) => ` <metadata name="${key}">${value}</metadata>`)
  .join("\n")}
 <resources>
  <object id="2" p:UUID="${UUID.object}" type="model">
   <components>
    <component p:path="/3D/Objects/object_1.model" objectid="1" p:UUID="${UUID.component}" transform="1 0 0 0 1 0 0 0 1 ${cx} ${cy} ${cz}"/>
   </components>
  </object>
 </resources>
 <build p:UUID="${UUID.build}">
  <item objectid="2" p:UUID="${UUID.item}" transform="1 0 0 0 1 0 0 0 1 ${round(PLATE / 2 - cx)} ${round(PLATE / 2 - cy)} ${round(-min[2])}" printable="1"/>
 </build>
</model>`;

  const thumbnails = picture !== null;
  const modelSettings = `${XML}
<config>
  <object id="2">
    <metadata key="name" value="${name}"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="${faces}"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="${name}"/>
      <metadata key="matrix" value="1 0 0 ${cx} 0 1 0 ${cy} 0 0 1 ${cz} 0 0 0 1"/>
      <metadata key="source_file" value="${name}.3mf"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="${cx}"/>
      <metadata key="source_offset_y" value="${cy}"/>
      <metadata key="source_offset_z" value="${cz}"/>
      <metadata key="extruder" value="1"/>
      <mesh_stat face_count="${faces}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="gcode_file" value=""/>${
      thumbnails
        ? `
    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>
    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_1.png"/>`
        : ""
    }
    <model_instance>
      <metadata key="object_id" value="2"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble>
  </assemble>
</config>`;

  const { default: settings } = await import("./bambu-a1.json");
  const filament = hexOf(input.color).toUpperCase();
  const projectSettings = JSON.stringify(
    {
      ...settings,
      filament_colour: [filament],
      filament_multi_colour: [filament],
      // It stands on its raised lines: the bigger hollows between them
      // want supports – from the plate only, never on the stamp.
      enable_support: "1",
      support_on_build_plate_only: "1",
    },
    null,
    4
  );

  const zip = zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    ...(picture && {
      "Metadata/plate_1.png": picture,
      "Metadata/plate_1_small.png": picture,
      "Metadata/plate_no_light_1.png": picture,
    }),
    "3D/Objects/object_1.model": strToU8(object.join("\n")),
    "3D/3dmodel.model": strToU8(model),
    "3D/_rels/3dmodel.model.rels": strToU8(MODEL_RELS),
    "Metadata/project_settings.config": strToU8(projectSettings),
    "Metadata/model_settings.config": strToU8(modelSettings),
    "Metadata/cut_information.xml": strToU8(CUT_INFORMATION),
    "Metadata/slice_info.config": strToU8(SLICE_INFO),
    "Metadata/filament_sequence.json": strToU8(FILAMENT_SEQUENCE),
    "_rels/.rels": strToU8(rels(thumbnails)),
  });
  return new Blob([zip], { type: "model/3mf" });
};
