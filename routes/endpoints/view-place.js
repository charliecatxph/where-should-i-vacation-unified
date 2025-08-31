import { Timestamp } from "firebase-admin/firestore";
import {
  gcpMaps_placeDetailsEnterprise_FILLER,
} from "../../dependencies/GCP/PlaceDetailsEnterpriseFiller.js";
import { processPlace } from "./get-travel-recommendations.js";
import db from "../../dependencies/firestore.js";
import moment from "moment";

const viewPlace = async (req, res) => {
  const { id } = req.query;

  if (!id.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const place = await processPlace({ id: id.trim() }, false);
    if (!place) {
      return res.status(400).json({
        code: "PLACE_NOT_EXIST",
      });
    }

    // check if place has a rating, editorialSummary, and generativeSummary
    let fill;
    if (!place.description && !place.rating) {
      const filler = await gcpMaps_placeDetailsEnterprise_FILLER(id.trim());
      fill = {
        description:
          filler.editorialSummary?.text ??
          filler.generativeSummary ??
          "No description.",
        rating: filler.rating || "N/A",
      };
    }

    const {
      cached,
      id: ctx_dd1,
      ttl,
      ...clean
    } = {
      ...place,
      ...fill,
    };

    res.json({
      place: clean,
    });

    if (!place.description && !place.rating) {
      await db
        .collection("cached_places")
        .doc(id)
        .set(
          {
            ...Object.fromEntries(
              Object.entries(place).filter(([k]) => k !== "cached")
            ),
            ...fill,
            ttl: Timestamp.fromMillis(moment.utc().add(2, "weeks").valueOf()),
            enterprise: false,
          },
          { merge: true }
        )
        .catch((e) => {
          throw new Error(e.message);
        });
    }

    if (!place.cached) {
      try {
        await processPlace(place, true);
      } catch (e) {
        console.log(
          `[${new Date().toISOString()}] [Place Caching] IIFE Exception at ${req.originalUrl}. Error data: ${e.message}`
        );
      }
    }
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [View Place] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { viewPlace };
