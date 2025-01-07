#!/usr/bin/env node

import { spawnSync, execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";

interface Config {
  GOOGLE_MAPS_API_KEY: string | undefined;
  DEFAULT_CENTER_ADDRESS: string;
  DEFAULT_RADIUS: number;
  UPDATE_URL: string;
  DEV: boolean;
}

// Configuration object with default values
const config: Config = {
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  DEFAULT_CENTER_ADDRESS: "Av. Lauro de Carvalho, 943 - Centro, Jaguariúna",
  DEFAULT_RADIUS: 500,
  UPDATE_URL: "https://byomess.github.io/scripts/scrapper",
  DEV: process.env.DEV === "true",
};

/**
 * Defines a service suggestion with a name and a condition function.
 */
interface ServiceSuggestion {
  name: string;
  condition: (place: PlaceDetailsResult) => boolean;
}

interface ServiceSuggestion {
  name: string;
  condition: (place: PlaceDetailsResult) => boolean;
}

const serviceSuggestions: ServiceSuggestion[] = [
  {
    name: "Criação de Website",
    condition: (place) => !place.result.website,
  },
  //   {
  //     name: "Sistema de Agendamento Online",
  //     condition: (place) =>
  //       !place.result.website &&
  //       (place.result.types?.includes("spa") ||
  //         place.result.types?.includes("hair_care") ||
  //         place.result.types?.includes("doctor") ||
  //         place.result.types?.includes("dentist") ||
  //         place.result.types?.includes("gym") ||
  //         place.result.types?.includes("beauty_salon")), // Added more relevant types
  //   },
  //   {
  //     name: "Fotografia Profissional",
  //     condition: (place) => {
  //       const hasPhotos = place.result.photos && place.result.photos.length > 0;

  //       if (!hasPhotos) {
  //         return true; // No photos at all is a strong indicator
  //       }

  //       const hasFewPhotos = place.result.photos.length < 5;
  //       const hasLowQualityPhotos = place.result.photos.some(
  //         (photo) => photo.width < 500 || photo.height < 500
  //       ); // Assuming smaller dimensions might indicate lower quality

  //       return hasFewPhotos || hasLowQualityPhotos;
  //     },
  //   },
  //   {
  //     name: "Gestão de Reputação",
  //     condition: (place) =>
  //       (place.result.rating && place.result.rating < 4) || // Low rating
  //       (place.result.reviews &&
  //         place.result.reviews.some(
  //           (review) => review.rating <= 2 && review.text.length > 50
  //         )), // Or some longer negative reviews (more than 50 characters)
  //   },
  {
    name: "Atualização do Cadastro no Google Meu Negócio",
    condition: (place) =>
      !place.result.opening_hours || // No opening hours
      !place.result.formatted_phone_number || // No phone number
      !place.result.photos?.length, // No photos
  },
  //   {
  //     name: "Integração com CRM",
  //     condition: (place) =>
  //       place.result.user_ratings_total > 50 && place.result.website, // Likely has a customer base and a website to integrate with
  //   },
  //   {
  //     name: "Otimização de SEO",
  //     condition: (place) => {
  //       const hasRelevantTypes =
  //         place.result.types?.some((type) =>
  //           [
  //             "restaurant",
  //             "cafe",
  //             "bar",
  //             "store",
  //             "doctor",
  //             "dentist",
  //             "lawyer",
  //             "hair_care",
  //             "spa",
  //             "gym",
  //             "beauty_salon",
  //             // Add more locally relevant types here
  //           ].includes(type)
  //         ) || false;

  //       const hasLowRating = place.result.rating && place.result.rating < 4.5;

  //       return hasRelevantTypes && hasLowRating;
  //     },
  //   },
  //   {
  //     name: "Análise de Concorrentes",
  //     condition: (place) => {
  //       const hasRelevantTypes =
  //         place.result.types?.some((type) =>
  //           [
  //             "restaurant",
  //             "cafe",
  //             "bar",
  //             "store",
  //             "doctor",
  //             "dentist",
  //             "lawyer",
  //             "hair_care",
  //             "spa",
  //             "gym",
  //             "beauty_salon",
  //             // Add more locally relevant types here
  //           ].includes(type)
  //         ) || false;

  //       const hasLowRating = place.result.rating && place.result.rating < 4;

  //       return hasRelevantTypes && hasLowRating;
  //     },
  //   },
  //   {
  //     name: "Marketing de Conteúdo",
  //     condition: (place) =>
  //       !place.result.website || // No website to host content
  //       place.result.user_ratings_total < 20, // Low engagement
  //   },
  //   {
  //     name: "Gestão de Anúncios Pagos (Google Ads, Social Media Ads)",
  //     condition: (place) =>
  //       !place.result.website || // Might need help driving traffic if no website
  //       place.result.rating < 4.5 || // Could improve visibility and reputation
  //       place.result.user_ratings_total < 50, // Could use ads to increase engagement
  //   },
  //   {
  //     name: "Email Marketing",
  //     condition: (place) =>
  //       place.result.website && place.result.user_ratings_total > 30, // Assumes some established presence and potential customer base
  //   },
  //   {
  //     name: "Criação de Identidade Visual ou Logotipos",
  //     condition: (place) => {
  //         const conditions = [
  //             !place.result.website,
  //             place.result.user_ratings_total < 10, // Low engagement
  //             place.result.rating < 4 // Low reputation
  //         ];

  //         return conditions.every(condition => condition);
  //     }
  //   },
];

// Error Handling
class GoogleMapsError extends Error {
  constructor(message: string, status?: number) {
    let errorMessage = `Google Maps Error: ${message}`;
    if (status) {
      errorMessage += ` (Status: ${status})`;
    }
    super(errorMessage);
    this.name = "GoogleMapsError";
  }
}

class UpdateError extends Error {
  constructor(message: string) {
    super(`Update Error: ${message}`);
    this.name = "UpdateError";
  }
}

class FileError extends Error {
  constructor(message: string) {
    super(`File Error: ${message}`);
    this.name = "FileError";
  }
}

// Data Structures for API Responses (Partial - add more as needed)
interface GeocodeResult {
  results: {
    geometry: {
      location: LatLng;
    };
  }[];
}

interface LatLng {
  lat: number;
  lng: number;
}

interface PlacesNearbyResult {
  results: PlaceResult[];
  status: string;
  error_message?: string;
  next_page_token?: string;
}

interface PlaceResult {
  place_id: string;
  [key: string]: any; // You can define more specific properties here
}

interface PlaceDetailsResult {
  result: PlaceResult;
  status: string;
  error_message?: string;
}

// Service class for Google Maps operations using Web Service APIs
class GoogleMapsService {
  private readonly BASE_URL = "https://maps.googleapis.com/maps/api";

  private async handleRequest<T>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    const url = new URL(`${this.BASE_URL}/${endpoint}`);
    const allParams = { ...params, key: config.GOOGLE_MAPS_API_KEY };

    Object.keys(allParams).forEach((key) =>
      url.searchParams.append(key, String(allParams[key]))
    );

    // if (config.DEV) {
    //   console.log("GoogleMapsService.handleRequest");
    //   console.log("url", url.toString());
    // }

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Request failed: ${url.toString()}`);
      console.error("Response:");
      console.error(await response.text);
      throw new GoogleMapsError(
        `Request failed with status: ${response.status}`,
        response.status
      );
    }

    const data = await response.json();

    // console.log("data >>>", data);

    // Check for error status codes from the API
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new GoogleMapsError(
        data.error_message || `API Error: ${data.status}`,
        response.status
      );
    }

    return data;
  }

  async geocode(address: string): Promise<LatLng> {
    const data = await this.handleRequest<GeocodeResult>("geocode/json", {
      address,
    });
    if (data.results.length === 0) {
      throw new GoogleMapsError("No geocode results found.");
    }
    return data.results[0].geometry.location;
  }

  async findPlacesNearby(
    latLng: LatLng,
    search: string,
    radius: number = config.DEFAULT_RADIUS,
    pageToken?: string
  ): Promise<PlacesNearbyResult> {
    const params: Record<string, any> = {
      location: `${latLng.lat},${latLng.lng}`,
      radius,
      keyword: search,
    };
    if (pageToken) {
      params.pagetoken = pageToken;
    }
    return this.handleRequest<PlacesNearbyResult>(
      "place/nearbysearch/json",
      params
    );
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
    return this.handleRequest<PlaceDetailsResult>("place/details/json", {
      place_id: placeId,
    });
  }
}

// Utility class for file operations and updates
// (This class remains largely the same as before)
class FileUtils {
  static calculateHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  static async checkForUpdates(): Promise<void> {
    if (config.DEV) return;

    try {
      const response = await fetch(config.UPDATE_URL);
      if (!response.ok) {
        throw new UpdateError(`Failed to fetch update: ${response.statusText}`);
      }

      const remoteContent = await response.text();
      const remoteHash = this.calculateHash(remoteContent);
      const localContent = readFileSync(__filename, "utf-8");
      const localHash = this.calculateHash(localContent);

      if (remoteHash !== localHash) {
        writeFileSync(__filename, remoteContent);
        console.log("Script updated. Restarting...");
        spawnSync("node", [__filename, ...process.argv.slice(2)], {
          stdio: "inherit",
        });
        process.exit(0);
      }
    } catch (error) {
      throw new UpdateError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static outputResults(results: PlaceDetailsResult[]): void {
    try {
      const fileName = `results-${new Date()
        .toISOString()
        .replace(/[-:.]/g, "")}.json`;
      writeFileSync(fileName, JSON.stringify(results, null, 2));
      console.log("Results saved to results.json");
    } catch (error) {
      throw new FileError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

// Interface for defining how a place should be scored
interface PlaceScoreCalculator {
  calculate(place: PlaceDetailsResult): number;
}

class OptimizedPlaceScoreCalculator implements PlaceScoreCalculator {
  /**
   * Calculates a score for a place based on various factors.
   * The lower the score, the poorer the information, thus the better the lead.
   *
   * @param place - The place details result from the Google Maps API.
   * @returns A numerical score representing the richness of the place's information.
   */
  calculate(place: PlaceDetailsResult): number {
    // Define weights for each factor.
    // Higher weight means the factor is considered more important in the overall score.
    // We use negative weights here because we want to identify places with *less* information.
    const weights = {
      hasWebsite: -5, // A strong indicator of a well-maintained business profile.
      hasPhoneNumber: -4, // Essential for businesses.
      photosCount: -0.5, // More photos usually mean a more complete profile.
      hasOpeningHours: -4, // Important for customers to know when a business is open.
      userRatingsTotal: -0.01, // A higher number of ratings indicates more engagement (within a reasonable range).
      averageRating: -1.5, // Higher ratings are generally better, but we penalize less because it's subjective.
      reviewsCount: -0.1, // Each review adds a bit of value, indicating customer interaction.
      hasDetailedAddress: -3, // A complete address is very important.
      hasTypes: -0.5, // Each type can improve categorization, but don't weight this too heavily.
      isOpenNow: -1, // Important in some contexts, but not always a deal-breaker.
      featureScore: -0.2, // Each additional feature (like serves_breakfast, takeout, etc.) indicates a more complete profile.
    };

    // Calculate scores for individual factors based on the weights.
    const score =
      weights.hasWebsite * (place.result.website ? 1 : 0) +
      weights.hasPhoneNumber * (place.result.formatted_phone_number ? 1 : 0) +
      weights.photosCount * (place.result.photos?.length || 0) +
      weights.hasOpeningHours *
        (place.result.opening_hours || place.result.current_opening_hours
          ? 1
          : 0) +
      weights.userRatingsTotal *
        Math.min(100, place.result.user_ratings_total || 0) + // Limit the impact of a huge number of ratings.
      weights.averageRating * (place.result.rating || 0) +
      weights.reviewsCount * (place.result.reviews?.length || 0) +
      weights.hasDetailedAddress * (place.result.formatted_address ? 1 : 0) +
      weights.hasTypes * (place.result.types?.length || 0) +
      weights.isOpenNow * (place.result.opening_hours?.open_now ? 1 : 0) +
      weights.featureScore * this.calculateFeatureScore(place);

    // Log the place ID and its score for debugging.
    // console.log(
    //     `Place ID: ${place.result.place_id}, Score: ${score}, ${place.result.name}`
    // );

    return score;
  }

  /**
   * Calculates a feature-based score for the place.
   *
   * @param place - The place details result.
   * @returns A numerical score based on the presence of certain features.
   */
  private calculateFeatureScore(place: PlaceDetailsResult): number {
    const features: string[] = [
      // Use string array
      "reservable",
      "serves_beer",
      "serves_breakfast",
      "serves_brunch",
      "serves_dinner",
      "serves_lunch",
      "serves_vegetarian_food",
      "serves_wine",
      "takeout",
      "website",
    ];
    return features.reduce(
      (score, feature) =>
        score +
        (place.result[feature as keyof PlaceResult] !== undefined ? 1 : 0), // feature as keyof PlaceResult
      0
    );
  }
}

// Concrete implementation of the scoring algorithm
// (This class remains largely the same as before)
class DefaultPlaceScoreCalculator implements PlaceScoreCalculator {
  calculate(place: PlaceDetailsResult): number {
    const scoreFactors: Record<string, (p: PlaceDetailsResult) => number> = {
      photos: (p) => p.result.photos?.length || 0,
      rating: (p) => (p.result.rating ? Math.sqrt(p.result.rating) : 0),
      openNow: (p) => (p.result.opening_hours?.open_now ? 1 : 0),
      vicinity: (p) => (p.result.vicinity ? 1 : 0),
      userRatings: (p) =>
        p.result.user_ratings_total
          ? Math.log10(p.result.user_ratings_total)
          : 0,
      addressComponents: (p) =>
        p.result.address_components?.length
          ? Math.log10(p.result.address_components.length)
          : 0,
      reviews: (p) => p.result.reviews?.length || 0,
      openingHours: (p) =>
        p.result.current_opening_hours?.periods?.length ||
        p.result.opening_hours?.periods?.length
          ? 1
          : 0,
      contact: (p) => (p.result.formatted_phone_number ? 1 : 0),
      features: (p) => this.calculateFeatureScore(p),
      types: (p) =>
        p.result.types?.length ? Math.log10(p.result.types.length) : 0,
    };

    return Object.values(scoreFactors).reduce((score, factor) => {
      try {
        return score + factor(place);
      } catch (error) {
        console.warn(
          `Error applying scoring factor to place ${place.result.place_id}: ${error}`
        );
        return score;
      }
    }, 0);
  }

  private calculateFeatureScore(place: PlaceDetailsResult): number {
    const features: string[] = [
      "reservable",
      "serves_beer",
      "serves_breakfast",
      "serves_brunch",
      "serves_dinner",
      "serves_lunch",
      "serves_vegetarian_food",
      "serves_wine",
      "takeout",
      "website",
    ];
    return features.reduce(
      (score, feature) => score + (place.result[feature] !== undefined ? 1 : 0),
      0
    );
  }
}

// Main application class
class PlacesSearchApp {
  private mapsService: GoogleMapsService;
  private placeScorer: PlaceScoreCalculator;

  constructor(
    mapsService: GoogleMapsService,
    placeScorer: PlaceScoreCalculator
  ) {
    this.mapsService = mapsService;
    this.placeScorer = placeScorer;
  }

  async initialize(): Promise<void> {
    await FileUtils.checkForUpdates();
  }

  async run(): Promise<void> {
    try {
      await this.initialize();

      const searchQuery = this.getSearchQuery();
      const radius = this.getRadius();
      const centerAddress = this.getCenterAddress();
      const center = await this.mapsService.geocode(centerAddress);

      const places = await this.searchAndScorePlaces(
        searchQuery,
        center,
        radius
      );

      // Add suggested services to each place
      const placesWithServices = places.map((place) => ({
        ...place,
        suggestedServices: this.suggestServices(place),
      }));

      FileUtils.outputResults(placesWithServices);

      console.log("Total places found:", places.length);
    } catch (error) {
      console.error("Error during execution:", error);
      process.exit(1);
    }
  }

  private getSearchQuery(): string {
    const searchQuery = process.argv[2];
    if (!searchQuery) {
      throw new Error("Please provide a search query.");
    }
    return searchQuery;
  }

  private getRadius(): number {
    return Number(process.env.RADIUS) || config.DEFAULT_RADIUS;
  }

  private getCenterAddress(): string {
    return process.env.CENTER_ADDRESS || config.DEFAULT_CENTER_ADDRESS;
  }

  async searchAndScorePlaces(
    query: string,
    center: LatLng,
    radius: number
  ): Promise<PlaceDetailsResult[]> {
    let places: PlaceDetailsResult[] = [];
    let nextPageToken: string | undefined;

    do {
      console.log('');
      console.log(`Buscando estabelecimentos, aguarde...`);
      console.log(`Página: ${nextPageToken ? nextPageToken.slice(0, 10) : '1'}`);

      const placesNearbyResult: PlacesNearbyResult =
        await this.mapsService.findPlacesNearby(
          center,
          query,
          radius,
          nextPageToken
        );
      
      console.log(`Estabelecimentos encontrados: ${placesNearbyResult.results.length}`);
      console.log('Carregando detalhes para rankeamento, aguarde...')

      // Fazendo as requisições de detalhes uma por vez
      for (const place of placesNearbyResult.results) {
        const placeDetails = await this.mapsService.getPlaceDetails(
          place.place_id
        );
        places.push(placeDetails);
      }

      nextPageToken = placesNearbyResult.next_page_token;
    } while (nextPageToken);

    console.log(`Total de estabelecimentos encontrados: ${places.length}`);

    return places
      .map((place) => ({
        ...place,
        _SCORE: this.placeScorer.calculate(place),
      }))
      .sort((a, b) => (b._SCORE || 0) - (a._SCORE || 0));
  }

  /**
   * Suggests services based on the place details using the defined service suggestions.
   *
   * @param place - The place details result from the Google Maps API.
   * @returns An array of suggested service names.
   */
  suggestServices(place: PlaceDetailsResult): string[] {
    return serviceSuggestions
      .filter((service) => service.condition(place))
      .map((service) => service.name);
  }
}

// Execute the application
(async () => {
  try {
    const mapsService = new GoogleMapsService();
    const placeScorer = new OptimizedPlaceScoreCalculator();
    const app = new PlacesSearchApp(mapsService, placeScorer);
    await app.run();
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
})();
