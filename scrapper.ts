#!/usr/bin/env node

import { spawnSync, execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import * as fs from "fs";

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
  [key: string]: any;
}

interface PlaceDetailsResult {
  result: PlaceResult;
  status: string;
  suggestedServices: string[];
  _ADDRESS_ANALYSIS: AddressAnalysisResult;
  _SCORE: number;
  _OVERALL_ANALYSIS_RESULT: OverallAnalysisResult; // Nova propriedade adicionada
  error_message?: string;
}

interface OverallAnalysisResult {
  score: number;
  feedback: string[] | null;
  consultingMessage: string | null;
}

interface AddressAnalysisResult {
  score: number; // Pontuação geral da qualidade do endereço (0-100)
  completeness: {
    // Detalhes sobre a completude do endereço
    street: boolean;
    number: boolean;
    neighborhood: boolean;
    city: boolean;
    state: boolean;
    postalCode: boolean;
  };
  formatting: {
    // Detalhes sobre a formatação do endereço
    capitalization: string; // "good", "fair", "poor"
    punctuation: string; // "good", "fair", "poor"
    abbreviations: string; // "consistent", "inconsistent", "none"
  };
  accuracy: {
    // Avaliação da precisão/veracidade do endereço (opcional - pode necessitar de mais contexto)
    likelyReal: boolean; // true ou false, baseado em heurísticas ou integrações com serviços de geolocalização
    confidence: string; // "high", "medium", "low" - baseado em heurísticas, listas de cidades/bairros, etc.
  };
  overallQuality: string; // Avaliação geral: "excellent", "good", "fair", "poor"
  recommendations: string[]; // Lista de sugestões para melhorar o endereço
}

class InformationQualityAnalyzer {
  private static readonly GOOGLE_AI_STUDIO_API_KEY: string | undefined =
    process.env.GOOGLE_AI_STUDIO_API_KEY;
  private static readonly MODEL_NAME: string = process.env.MODEL || "gemini-1.5-flash";
  private static readonly API_ENDPOINT: string = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL_NAME}:generateContent?key=${this.GOOGLE_AI_STUDIO_API_KEY}`;

  /**
   * Analisa a qualidade de uma string de endereço usando a API do Google AI Studio.
   *
   * @param address - A string de endereço a ser analisada.
   * @returns Uma Promise que resolve para um objeto AnalysisResult.
   */
  static async analyzeAddress(address: string): Promise<AddressAnalysisResult> {
    if (!this.GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "Chave de API do Google AI Studio não configurada. Defina a variável de ambiente GOOGLE_AI_STUDIO_API_KEY."
      );
    }

    if (!address) {
      return new Promise((resolve, reject) => {
        reject(new Error("Endereço não fornecido."));
      });
    }

    const prompt = this.buildPrompt(address);

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // if (!response.ok) {
      //   const errorText = await response.text();
      //   throw new Error(
      //     `Erro na API do Google AI Studio: ${response.status} - ${errorText}`
      //   );
      // }

      const data = await response.json();

      console.log("data", JSON.stringify(data, null, 2));

      // Extrai a resposta do modelo (JSON)
      const generatedContent = data.candidates[0].content.parts[0].text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
        

      // ----- Início da correção do JSON -----
      const correctedJSON = this.validateAndFixJSON(generatedContent);
      // ----- Fim da correção do JSON -----

      // Converte a string JSON para um objeto
      const analysisResult = JSON.parse(correctedJSON) as AddressAnalysisResult; // Usar correctedJSON em vez de generatedContent

      return analysisResult;
    } catch (error) {
      console.error("Erro ao analisar endereço:", error);
      throw new Error(`Falha ao analisar endereço: ${error}`);
    }
  }

  static validateAndFixJSON(jsonString: string): string {
    try {
      JSON.parse(jsonString);
      return jsonString; // Se já for válido, retorna sem alterações
    } catch (error) {
      console.warn("JSON inválido detectado, tentando corrigir...");

      // 1. Remove os delimitadores de bloco de código markdown (```json e ```)
      let correctedJSON = jsonString.replace(
        /```json\s*([\s\S]*?)\s*```/g,
        "$1"
      );

      // 2. Remove caracteres de controle problemáticos, mas mantém escapes Unicode:
      correctedJSON = correctedJSON.replace(
        /[\u0000-\u001F\u007F\u0080-\u009F]/g, // Gama de controle estendida
        ""
      );

      // 3. Adiciona vírgulas ausentes após strings em arrays, mas ignora se a string for seguida por ] ou } (indicando o final do array ou um objeto)
      correctedJSON = correctedJSON.replace(
        /(\"recommendations\":\s*\[.*?\])/gs,
        (match) => {
          // Dentro do array de recomendações, adiciona vírgulas após as aspas de fechamento de cada string,
          // a menos que a string seja seguida por ] ou }
          return match.replace(/"(\s*)(?![\}\]]|$)/g, '",');
        }
      );

      try {
        JSON.parse(correctedJSON);
        console.log("JSON corrigido com sucesso.");
        return correctedJSON;
      } catch (error) {
        console.error("Falha ao corrigir JSON:", error);
        console.error("JSON original:", jsonString);
        return jsonString; // Retorna o JSON original (inválido) em caso de falha
      }
    }
  }

  /**
   * Constrói o prompt para enviar à API do Google AI Studio.
   *
   * @param address - O endereço a ser analisado.
   * @returns O prompt formatado.
   */
  private static buildPrompt(address: string): string {
    return `
    Analise a qualidade do seguinte endereço e retorne um JSON com a seguinte estrutura:

    \`\`\`json
    {
      "score": 0,
      "completeness": {
        "street": false,
        "number": false,
        "neighborhood": false,
        "city": false,
        "state": false,
        "postalCode": false
      },
      "formatting": {
        "capitalization": "poor",
        "punctuation": "poor",
        "abbreviations": "none"
      },
      "accuracy": {
        "likelyReal": false,
        "confidence": "low"
      },
      "overallQuality": "poor",
      "recommendations": []
      }
    \`\`\`

    Onde:

    *   **score:** Um número entre 0 e 100 que representa a qualidade geral do endereço.
    *   **completeness:** Um objeto que indica se os principais componentes do endereço estão presentes (rua, número, bairro, cidade, estado, CEP).
    *   **formatting:** Um objeto que avalia a formatação do endereço em termos de capitalização ("good", "fair", "poor"), pontuação ("good", "fair", "poor") e uso de abreviações ("consistent" - se as abreviações são usadas de forma consistente, "inconsistent" - se são usadas de forma inconsistente, "none" - se não há abreviações).
    *   **accuracy:** (Opcional) Um objeto que avalia a precisão do endereço. "likelyReal" indica se o endereço parece ser real (true) ou não (false). "confidence" indica o nível de confiança dessa avaliação ("high", "medium", "low").
    *   **overallQuality:** Uma avaliação geral da qualidade do endereço ("excellent", "good", "fair", "poor").
    *   **recommendations:** Uma lista de recomendações para melhorar a qualidade do endereço.

    Endereço: ${address}
    `;
  }
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
      const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

      // JSON
      const jsonFileName = `results-${timestamp}.json`;
      writeFileSync(jsonFileName, JSON.stringify(results, null, 2));
      const fullJsonPath = fs.realpathSync(jsonFileName);
      console.log(`Resultados JSON salvos em: ${fullJsonPath}`);

      // Markdown
      const markdownFileName = `results-${timestamp}.md`;
      const markdownContent = this.generateMarkdownReport(results);
      writeFileSync(markdownFileName, markdownContent);
      const fullMarkdownPath = fs.realpathSync(markdownFileName);
      console.log(`Relatório Markdown salvo em: ${fullMarkdownPath}`);
    } catch (error) {
      throw new FileError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static generateMarkdownReport(results: PlaceDetailsResult[]): string {
    let markdown = "# Relatório de Estabelecimentos\n\n";

    results.forEach((place: PlaceDetailsResult, index: number) => {
      markdown += `## ${index + 1}. ${place.result.name}\n\n`;
      markdown += `- **Telefone:** ${
        place.result.formatted_phone_number || "Não informado"
      }\n`;
      markdown += `- **Website:** ${place.result.website || "Não informado"}\n`;
      markdown += `- **Horários de Funcionamento:**\n`;
      if (place.result.opening_hours?.weekday_text) {
        place.result.opening_hours.weekday_text.forEach((day) => {
          markdown += `  - ${day}\n`;
        });
      } else {
        markdown += `  - Não informado\n`;
      }
      markdown += `- **Avaliações:** ${
        place.result.user_ratings_total || 0
      } avaliações, Nota média: ${place.result.rating || "N/A"}\n`;
      markdown += `- **Endereço:** ${
        place.result.formatted_address || "Não informado"
      }\n`;

      // Análise do Endereço
      if (place._ADDRESS_ANALYSIS) {
        markdown += `- **Análise do Endereço:**\n`;
        markdown += `  - **Pontuação:** ${place._ADDRESS_ANALYSIS.score}\n`;
        markdown += `  - **Qualidade Geral:** ${place._ADDRESS_ANALYSIS.overallQuality}\n`;
        markdown += `  - **Completude:**\n`;
        markdown += `    - Rua: ${
          place._ADDRESS_ANALYSIS.completeness.street ? "Sim" : "Não"
        }\n`;
        markdown += `    - Número: ${
          place._ADDRESS_ANALYSIS.completeness.number ? "Sim" : "Não"
        }\n`;
        markdown += `    - Bairro: ${
          place._ADDRESS_ANALYSIS.completeness.neighborhood ? "Sim" : "Não"
        }\n`;
        markdown += `    - Cidade: ${
          place._ADDRESS_ANALYSIS.completeness.city ? "Sim" : "Não"
        }\n`;
        markdown += `    - Estado: ${
          place._ADDRESS_ANALYSIS.completeness.state ? "Sim" : "Não"
        }\n`;
        markdown += `    - CEP: ${
          place._ADDRESS_ANALYSIS.completeness.postalCode ? "Sim" : "Não"
        }\n`;
        markdown += `  - **Formatação:**\n`;
        markdown += `    - Capitalização: ${place._ADDRESS_ANALYSIS.formatting.capitalization}\n`;
        markdown += `    - Pontuação: ${place._ADDRESS_ANALYSIS.formatting.punctuation}\n`;
        markdown += `    - Abreviações: ${place._ADDRESS_ANALYSIS.formatting.abbreviations}\n`;
        markdown += `  - **Precisão:**\n`;
        markdown += `    - Provavelmente Real: ${
          place._ADDRESS_ANALYSIS.accuracy.likelyReal ? "Sim" : "Não"
        }\n`;
        markdown += `    - Confiança: ${place._ADDRESS_ANALYSIS.accuracy.confidence}\n`;

        // Adicionando as recomendações de melhoria
        if (place._ADDRESS_ANALYSIS.recommendations.length > 0) {
          markdown += `  - **Recomendações de Melhoria:**\n`;
          place._ADDRESS_ANALYSIS.recommendations.forEach((recommendation) => {
            markdown += `    - ${recommendation}\n`;
          });
        } else {
          markdown += `  - **Recomendações de Melhoria:** Nenhuma recomendação específica.\n`;
        }
      } else {
        markdown += `- **Análise do Endereço:** Não disponível\n`;
      }

      // Análise Geral
      if (place._OVERALL_ANALYSIS_RESULT) {
        markdown += `- **Análise Geral:**\n`;
        markdown += `  - **Pontuação:** ${place._OVERALL_ANALYSIS_RESULT.score}\n`;
        markdown += `  - **Feedback:** \n    - ${place._OVERALL_ANALYSIS_RESULT.feedback?.join(
          "\n    - "
        )}\n`;
      } else {
        markdown += `- **Análise Geral:** Não disponível\n`;
      }

      markdown += `- **Serviços Sugeridos:**\n`;
      if (place.suggestedServices?.length) {
        place.suggestedServices.forEach((service) => {
          markdown += `  - ${service}\n`;
        });
      } else {
        markdown += `  - Nenhum serviço sugerido\n`;
      }
      markdown += "\n";
    });

    return markdown;
  }
}

// Interface for defining how a place should be scored
interface PlaceScoreCalculator {
  calculate(place: PlaceDetailsResult): Promise<OverallAnalysisResult>;
}

class OptimizedPlaceScoreCalculator implements PlaceScoreCalculator {
  /**
   * Calculates a score for a place based on various factors.
   * The lower the score, the poorer the information, thus the better the lead.
   *
   * @param place - The place details result from the Google Maps API.
   * @returns A numerical score representing the richness of the place's information.
   */
  calculate(place: PlaceDetailsResult): Promise<OverallAnalysisResult> {
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

    return Promise.resolve({
      score,
      feedback: [], // No feedback is provided here.
      consultingMessage: ""
    });
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
  calculate(place: PlaceDetailsResult): Promise<OverallAnalysisResult> {
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

    const result = Object.values(scoreFactors).reduce((score, factor) => {
      try {
        return score + factor(place);
      } catch (error) {
        console.warn(
          `Error applying scoring factor to place ${place.result.place_id}: ${error}`
        );
        return score;
      }
    }, 0);

    return new Promise((resolve) =>
      resolve({
        score: result,
        feedback: [],
        consultingMessage: ""
      })
    );
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

class AIPlaceScoreCalculator implements PlaceScoreCalculator {
  private static readonly GOOGLE_AI_STUDIO_API_KEY: string | undefined =
    process.env.GOOGLE_AI_STUDIO_API_KEY;
  private static readonly MODEL_NAME: string = process.env.MODEL || "gemini-1.5-flash";
  private static readonly API_ENDPOINT: string = `https://generativelanguage.googleapis.com/v1beta/models/${AIPlaceScoreCalculator.MODEL_NAME}:generateContent?key=${AIPlaceScoreCalculator.GOOGLE_AI_STUDIO_API_KEY}`;

  /**
   * Calcula o score de um estabelecimento usando a API do Google AI Studio.
   *
   * @param place - Os detalhes do estabelecimento obtidos da API do Google Maps.
   * @returns Uma Promise que resolve para um número representando o score do estabelecimento.
   */
  async calculate(place: PlaceDetailsResult): Promise<OverallAnalysisResult> {
    this.validateApiKey();

    const prompt = this.buildPrompt(place);
    const requestBody = this.createRequestBody(prompt);

    try {
      const response = await this.fetchApiResponse(requestBody);
      const generatedContent = this.extractGeneratedContent(response);
      const overallAnalysisResult =
        this.extractScoreAndFeedback(generatedContent);

      return overallAnalysisResult;
    } catch (error) {
      console.error("Erro ao calcular score do estabelecimento:", error);
      throw new Error(`Falha ao calcular score do estabelecimento: ${error}`);
    }
  }

  private validateApiKey(): void {
    if (!AIPlaceScoreCalculator.GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "Chave de API do Google AI Studio não configurada. Defina a variável de ambiente GOOGLE_AI_STUDIO_API_KEY."
      );
    }
  }

  private createRequestBody(prompt: string): object {
    return {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };
  }

  private async fetchApiResponse(requestBody: object): Promise<any> {
    const response = await fetch(AIPlaceScoreCalculator.API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro na API do Google AI Studio: ${response.status} - ${errorText}`
      );
    }

    return response.json();
  }

  private extractGeneratedContent(data: any): string {
    return data.candidates[0].content.parts[0].text;
  }

  private extractScoreAndFeedback(
    generatedContent: string
  ): OverallAnalysisResult {
    const jsonString = this.extractJsonString(generatedContent);
    const parsedResponse = this.flexibleParseJSON(jsonString);

    if (
      typeof parsedResponse.score === "number" &&
      parsedResponse.feedback?.length
    ) {
      return {
        score: parsedResponse.score,
        feedback: parsedResponse.feedback,
        consultingMessage: parsedResponse.consultingMessage || ""
      };
    }

    throw new Error(
      "Não foi possível extrair score e feedback da resposta do modelo."
    );
  }

  private extractJsonString(generatedContent: string): string {
    const jsonMatch = generatedContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      console.error("Não foi encontrado um bloco JSON na resposta.");
      console.error("Generated Content:", generatedContent);
      throw new Error("Não foi possível extrair o JSON da resposta do modelo.");
    }
    return jsonMatch[1];
  }

  private flexibleParseJSON(jsonString: string): any {
    const correctedJSON = this.correctJsonFormatting(jsonString);
    try {
      return JSON.parse(correctedJSON);
    } catch (error) {
      console.error("Erro ao fazer parsing do JSON corrigido:", error);
      throw new Error("Falha ao fazer parsing do JSON.");
    }
  }

  private correctJsonFormatting(jsonString: string): string {
    return jsonString
      .replace(/([}\]]),/g, "$1")
      .replace(/,([}\]])/g, "$1")
      .replace(/: ".*?"/g, (match) => match.replace(/\n/g, "\\n"));
  }

  private buildPrompt(place: PlaceDetailsResult): string {
    return `
      Você é um especialista em análise de dados de estabelecimentos comerciais. Sua tarefa é avaliar a qualidade das informações de um estabelecimento com base nos dados fornecidos e atribuir um score de 0 a 100.
  
      Um score mais alto indica que o estabelecimento tem informações mais completas, atualizadas e de alta qualidade em seu perfil, sugerindo que é um negócio bem gerenciado e menos propenso a precisar de serviços de marketing digital. Por outro lado, um score mais baixo sugere que o estabelecimento tem informações incompletas, desatualizadas ou de baixa qualidade, tornando-o um lead mais qualificado para serviços de marketing digital.
  
      Considere os seguintes fatores ao avaliar o estabelecimento:
  
      *   **Completude das informações:** O estabelecimento possui website, número de telefone, horário de funcionamento, fotos e uma descrição detalhada?
      *   **Qualidade das fotos:** As fotos são de alta qualidade e representam bem o estabelecimento?
      *   **Avaliações:** O estabelecimento possui muitas avaliações? A nota média é alta? As avaliações são recentes e relevantes?
      *   **Interação com clientes:** O estabelecimento responde às avaliações dos clientes?
      *   **Presença online:** O estabelecimento tem um website bem projetado e otimizado para SEO? Ele está ativo nas redes sociais?
      *   **Atualização das informações:** As informações do estabelecimento estão atualizadas e consistentes em diferentes plataformas?
  
      Aqui estão os dados do estabelecimento:
  
      \`\`\`json
      ${JSON.stringify(place.result, null, 2)}
      \`\`\`
  
      Com base nesses dados, atribua um score de 0 a 100 ao estabelecimento e forneça uma lista de feedbacks com sugestões de melhorias, quando aplicável.
  
      Não crie feedbacks que não tenham como base dados disponíveis do JSON fornecido acima, ou seja, não faça presunções.

      Quando aplicável, escreva uma mensagem personalizada que poderá ser usada para enviar ao WhatsApp do estabelecimento, oferecendo o serviço de consultoria e atualização dos dados no Google Meu Negócio. Escreva uma mensagem com alto potencial de venda, que seja conciso e aponte as melhorias mais importantes que pode ser feito, baseada na análise.

      **RETORNE UM JSON ESTRITAMENTE VÁLIDO, SEM TEXTO ADICIONAL. CERTIFIQUE-SE DE QUE SUA RESPOSTA SEJA UM OBJETO JSON VÁLIDO, COM CHAVES E VALORES ENTRE ASPAS DUPLAS, E QUE NÃO HAJA VÍRGULAS SOLTAS APÓS O ÚLTIMO ELEMENTO DE UM ARRAY OU OBJETO.**
  
      **DENTRO DO JSON, ESCAPE CORRETAMENTE QUAISQUER CARACTERES ESPECIAIS, INCLUINDO QUEBRAS DE LINHA (\\n) E ASPAS DUPLAS (\"). NÃO INCLUA CARACTERES DE CONTROLE.**
  
      Sua resposta DEVE seguir o seguinte formato:
  
      \`\`\`json
      {
        "score": number,
        "feedback": string[] | null,
        "consultingMessage": string | null
      }
      \`\`\`
      `;
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
      console.log("");
      console.log(`Buscando estabelecimentos, aguarde...`);
      console.log(
        `Página: ${nextPageToken ? nextPageToken.slice(0, 10) : "1"}`
      );

      const placesNearbyResult: PlacesNearbyResult =
        await this.mapsService.findPlacesNearby(
          center,
          query,
          radius,
          nextPageToken
        );

      // const placesNearbyResponse = await this.mapsService.findPlacesNearby(
      //   center,
      //   query,
      //   radius,
      //   nextPageToken
      // );

      // const placesNearbyResult: PlacesNearbyResult = {
      //   ...placesNearbyResponse,
      //   results: placesNearbyResponse.results.slice(0, 5),
      // };

      console.log(
        `Estabelecimentos encontrados: ${placesNearbyResult.results.length}`
      );
      console.log("Carregando detalhes para rankeamento, aguarde...");

      // Fazendo as requisições de detalhes uma por vez
      for (const place of placesNearbyResult.results) {
        const placeDetails = await this.mapsService.getPlaceDetails(
          place.place_id
        );
        places.push(placeDetails);
      }

      nextPageToken = placesNearbyResult.next_page_token;
    } while (nextPageToken);

    console.log("");
    console.log(`Total de estabelecimentos encontrados: ${places.length}`);

    const analyzedPlaces = await Promise.all(
      places.map(async (place) => {
        const addressAnalysis = await InformationQualityAnalyzer.analyzeAddress(
          place.result.formatted_address
        );
        return {
          ...place,
          _OVERALL_ANALYSIS_RESULT: await this.placeScorer.calculate(place),
          _ADDRESS_ANALYSIS: addressAnalysis,
        };
      })
    );

    // Ordenar os estabelecimentos com base no _SCORE após a resolução de todas as Promises
    return analyzedPlaces.sort((a, b) => (b._SCORE || 0) - (a._SCORE || 0));
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
    // const placeScorer = new OptimizedPlaceScoreCalculator();
    const placeScorer = new AIPlaceScoreCalculator();
    const app = new PlacesSearchApp(mapsService, placeScorer);
    await app.run();
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
})();
