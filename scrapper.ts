#!/usr/bin/env node

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import * as fs from "fs";

// Configuration interface and object
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

const serviceSuggestions: ServiceSuggestion[] = [
  {
    name: "Criação de Website",
    condition: (place) => !place.result.website,
  },
  {
    name: "Atualização do Cadastro no Google Meu Negócio",
    condition: (place) =>
      !place.result.opening_hours || // No opening hours
      !place.result.formatted_phone_number || // No phone number
      !place.result.photos?.length, // No photos
  },
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

// Data Structures for API Responses
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
  name: string;
  [key: string]: any;
}

interface PlaceDetailsResult {
  result: PlaceResult;
  status: string;
  suggestedServices: string[];
  _ADDRESS_ANALYSIS: AddressAnalysisResult;
  _SCORE: number;
  _OVERALL_ANALYSIS_RESULT: OverallAnalysisResult;
  error_message?: string;
}

interface OverallAnalysisResult {
  score: number;
  feedback: string[] | null;
  consultingMessage: string | null;
}

interface AddressAnalysisResult {
  score: number;
  completeness: {
    street: boolean;
    number: boolean;
    neighborhood: boolean;
    city: boolean;
    state: boolean;
    postalCode: boolean;
  };
  formatting: {
    capitalization: string;
    punctuation: string;
    abbreviations: string;
  };
  accuracy: {
    likelyReal: boolean;
    confidence: string;
  };
  overallQuality: string;
  recommendations: string[];
}

class InformationQualityAnalyzer {
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly apiEndpoint: string;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Chave de API do Google AI Studio não configurada. Defina a variável de ambiente GOOGLE_AI_STUDIO_API_KEY."
      );
    }
    this.apiKey = apiKey;
    this.modelName = process.env.MODEL || "gemini-1.5-pro";
    this.apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
  }

  /**
   * Analisa a qualidade de uma string de endereço usando a API do Google AI Studio.
   *
   * @param address - A string de endereço a ser analisada.
   * @returns Uma Promise que resolve para um objeto AddressAnalysisResult.
   */
  async analyzeAddress(address: string): Promise<AddressAnalysisResult> {
    if (!address) {
      throw new Error("Endereço não fornecido.");
    }

    const prompt = this.buildPrompt(address);

    const requestBody = this.createRequestBody(prompt);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erro na API do Google AI Studio: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();

      // Extract the generated content
      const generatedContent = this.extractGeneratedContent(data);

      console.log("Conteúdo Gerado:", generatedContent);

      // Parse the JSON returned by the model
      const analysisResult = this.parseModelResponse(generatedContent);

      return analysisResult;
    } catch (error) {
      console.error("Erro ao analisar endereço:", error);
      throw new Error(`Falha ao analisar endereço: ${error}`);
    }
  }

  private createRequestBody(prompt: string): object {
    return {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4094,
      },
    };
  }

  private extractGeneratedContent(data: any): string {
    if (data && data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error("Conteúdo gerado não encontrado na resposta da API.");
    }
  }

  private parseModelResponse(generatedContent: string): AddressAnalysisResult {
    try {
      // Remove code blocks if present
      const jsonString = generatedContent
        .replace(/```json\s*([\s\S]*?)\s*```/, "$1")
        .trim();

      const analysisResult = JSON.parse(jsonString) as AddressAnalysisResult;

      return analysisResult;
    } catch (error) {
      console.error("Erro ao analisar a resposta do modelo:", error);
      console.error("Conteúdo Gerado:", generatedContent);
      throw new Error("Falha ao analisar a resposta do modelo.");
    }
  }

  private buildPrompt(address: string): string {
    return `
Analise a qualidade do seguinte endereço e retorne um JSON com a seguinte estrutura:

{
  "score": number,
  "completeness": {
    "street": boolean,
    "number": boolean,
    "neighborhood": boolean,
    "city": boolean,
    "state": boolean,
    "postalCode": boolean
  },
  "formatting": {
    "capitalization": "good" | "fair" | "poor",
    "punctuation": "good" | "fair" | "poor",
    "abbreviations": "consistent" | "inconsistent" | "none"
  },
  "accuracy": {
    "likelyReal": boolean,
    "confidence": "high" | "medium" | "low"
  },
  "overallQuality": "excellent" | "good" | "fair" | "poor",
  "recommendations": string[]
}

Onde:

- **score:** Um número entre 0 e 100 que representa a qualidade geral do endereço.
- **completeness:** Um objeto que indica se os principais componentes do endereço estão presentes (rua, número, bairro, cidade, estado, CEP).
- **formatting:** Um objeto que avalia a formatação do endereço em termos de capitalização ("good", "fair", "poor"), pontuação ("good", "fair", "poor") e uso de abreviações ("consistent" - se as abreviações são usadas de forma consistente, "inconsistent" - se são usadas de forma inconsistente, "none" - se não há abreviações).
- **accuracy:** Um objeto que avalia a precisão do endereço. "likelyReal" indica se o endereço parece ser real (true) ou não (false). "confidence" indica o nível de confiança dessa avaliação ("high", "medium", "low").
- **overallQuality:** Uma avaliação geral da qualidade do endereço ("excellent", "good", "fair", "poor").
- **recommendations:** Uma lista de recomendações para melhorar a qualidade do endereço.

Endereço: ${address}

**RETORNE APENAS UM JSON ESTRITAMENTE VÁLIDO, SEM TEXTO ADICIONAL. CERTIFIQUE-SE DE QUE SUA RESPOSTA SEJA UM OBJETO JSON VÁLIDO, COM CHAVES E VALORES ENTRE ASPAS DUPLAS, E QUE NÃO HAJA VÍRGULAS SOLTAS APÓS O ÚLTIMO ELEMENTO DE UM ARRAY OU OBJETO.**

**NÃO INCLUA QUALQUER TEXTO FORA DO OBJETO JSON.**
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

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`Request failed: ${url.toString()}`);
      const responseText = await response.text();
      console.error("Response:");
      console.error(responseText);
      throw new GoogleMapsError(
        `Request failed with status: ${response.status}`,
        response.status
      );
    }

    const data = await response.json();

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
        if (place._OVERALL_ANALYSIS_RESULT.feedback?.length) {
          markdown += `  - **Feedback:**\n`;
          place._OVERALL_ANALYSIS_RESULT.feedback.forEach((feedback) => {
            markdown += `    - ${feedback}\n`;
          });
        } else {
          markdown += `  - **Feedback:** Nenhum feedback disponível.\n`;
        }
      } else {
        markdown += `- **Análise Geral:** Não disponível\n`;
      }

      // Serviços Sugeridos
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

class AIPlaceScoreCalculator implements PlaceScoreCalculator {
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly apiEndpoint: string;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Chave de API do Google AI Studio não configurada. Defina a variável de ambiente GOOGLE_AI_STUDIO_API_KEY."
      );
    }
    this.apiKey = apiKey;
    this.modelName = process.env.MODEL || "gemini-1.5-pro";
    this.apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
  }

  /**
   * Calcula o score de um estabelecimento usando a API do Google AI Studio.
   *
   * @param place - Os detalhes do estabelecimento obtidos da API do Google Maps.
   * @returns Uma Promise que resolve para um objeto representando o score e feedback do estabelecimento.
   */
  async calculate(place: PlaceDetailsResult): Promise<OverallAnalysisResult> {
    const prompt = this.buildPrompt(place);
    const requestBody = this.createRequestBody(prompt);

    try {
      const response = await this.fetchApiResponse(requestBody);
      const generatedContent = this.extractGeneratedContent(response);
      const overallAnalysisResult = this.parseModelResponse(generatedContent);

      return overallAnalysisResult;
    } catch (error) {
      console.error("Erro ao calcular score do estabelecimento:", error);
      throw new Error(`Falha ao calcular score do estabelecimento: ${error}`);
    }
  }

  private createRequestBody(prompt: string): object {
    return {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4094,
      },
    };
  }

  private async fetchApiResponse(requestBody: object): Promise<any> {
    const response = await fetch(this.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: `Bearer ${this.apiKey}`,
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
    if (data && data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error("Conteúdo gerado não encontrado na resposta da API.");
    }
  }

  private parseModelResponse(generatedContent: string): OverallAnalysisResult {
    try {
      // Remove code blocks if present
      const jsonString = generatedContent
        .replace(/```json\s*([\s\S]*?)\s*```/, "$1")
        .trim();

      const parsedResponse = JSON.parse(jsonString);

      if (
        typeof parsedResponse.score === "number" &&
        (Array.isArray(parsedResponse.feedback) ||
          parsedResponse.feedback === null)
      ) {
        return {
          score: parsedResponse.score,
          feedback: parsedResponse.feedback,
          consultingMessage: parsedResponse.consultingMessage || null,
        };
      } else {
        throw new Error("A resposta não possui a estrutura esperada.");
      }
    } catch (error) {
      console.error("Erro ao analisar a resposta do modelo:", error);
      console.error("Conteúdo Gerado:", generatedContent);
      throw new Error("Falha ao analisar a resposta do modelo.");
    }
  }

  private buildPrompt(place: PlaceDetailsResult): string {
    return `
Você é um especialista em análise de dados de estabelecimentos comerciais. Sua tarefa é avaliar a qualidade das informações de um estabelecimento com base nos dados fornecidos e atribuir um score de 0 a 100.

Um score mais alto indica que o estabelecimento tem informações mais completas, atualizadas e de alta qualidade em seu perfil, sugerindo que é um negócio bem gerenciado e menos propenso a precisar de serviços de marketing digital. Por outro lado, um score mais baixo sugere que o estabelecimento tem informações incompletas, desatualizadas ou de baixa qualidade, tornando-o um lead mais qualificado para serviços de marketing digital.

Considere os seguintes fatores ao avaliar o estabelecimento:

- **Completude das informações:** O estabelecimento possui website, número de telefone, horário de funcionamento, fotos e uma descrição detalhada?
- **Qualidade das fotos:** As fotos são de alta qualidade e representam bem o estabelecimento?
- **Avaliações:** O estabelecimento possui muitas avaliações? A nota média é alta? As avaliações são recentes e relevantes?
- **Interação com clientes:** O estabelecimento responde às avaliações dos clientes?
- **Presença online:** O estabelecimento tem um website bem projetado e otimizado para SEO? Ele está ativo nas redes sociais?
- **Atualização das informações:** As informações do estabelecimento estão atualizadas e consistentes em diferentes plataformas?

Aqui estão os dados do estabelecimento:

${JSON.stringify(place.result, null, 2)}

Com base nesses dados, atribua um score de 0 a 100 ao estabelecimento e forneça uma lista de feedbacks com sugestões de melhorias, quando aplicável.

Não crie feedbacks que não tenham como base dados disponíveis do JSON fornecido acima, ou seja, não faça presunções.

Quando aplicável, escreva uma mensagem personalizada que poderá ser usada para enviar ao WhatsApp do estabelecimento, oferecendo o serviço de consultoria e atualização dos dados no Google Meu Negócio. Escreva uma mensagem com alto potencial de venda, que seja concisa e aponte as melhorias mais importantes que podem ser feitas, baseada na análise.

**RETORNE APENAS UM JSON ESTRITAMENTE VÁLIDO, SEM TEXTO ADICIONAL. CERTIFIQUE-SE DE QUE SUA RESPOSTA SEJA UM OBJETO JSON VÁLIDO, COM CHAVES E VALORES ENTRE ASPAS DUPLAS, E QUE NÃO HAJA VÍRGULAS SOLTAS APÓS O ÚLTIMO ELEMENTO DE UM ARRAY OU OBJETO.**

**NÃO INCLUA QUALQUER TEXTO FORA DO OBJETO JSON.**

Sua resposta DEVE seguir o seguinte formato:

{
  "score": number,
  "feedback": string[] | null,
  "consultingMessage": string | null
}
`;
  }
}

// Main application class
class PlacesSearchApp {
  private mapsService: GoogleMapsService;
  private placeScorer: PlaceScoreCalculator;
  private qualityAnalyzer: InformationQualityAnalyzer;

  constructor(
    mapsService: GoogleMapsService,
    placeScorer: PlaceScoreCalculator,
    qualityAnalyzer: InformationQualityAnalyzer
  ) {
    this.mapsService = mapsService;
    this.placeScorer = placeScorer;
    this.qualityAnalyzer = qualityAnalyzer;
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

  private async searchAndScorePlaces(
    query: string,
    center: LatLng,
    radius: number
  ): Promise<PlaceDetailsResult[]> {
    let places: PlaceDetailsResult[] = [];
    let nextPageToken: string | undefined;

    // do {
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

      console.log(
        `Estabelecimentos encontrados: ${placesNearbyResult.results.length}`
      );
      console.log("Carregando detalhes para rankeamento, aguarde...");

      // Fetch place details one by one
      for (const place of placesNearbyResult.results) {
        const placeDetails = await this.mapsService.getPlaceDetails(
          place.place_id
        );
        places.push(placeDetails);
      }

      nextPageToken = placesNearbyResult.next_page_token;
    // } while (nextPageToken);

    console.log("");
    console.log(`Total de estabelecimentos encontrados: ${places.length}`);

    const analyzedPlaces = await Promise.all(
      places.map(async (place) => {
        const addressAnalysis = await this.qualityAnalyzer.analyzeAddress(
          place.result.formatted_address
        );
        const overallAnalysis = await this.placeScorer.calculate(place);
        return {
          ...place,
          _OVERALL_ANALYSIS_RESULT: overallAnalysis,
          _SCORE: overallAnalysis.score,
          _ADDRESS_ANALYSIS: addressAnalysis,
        };
      })
    );

    // Ordenar os estabelecimentos com base no _SCORE após a resolução de todas as Promises
    return analyzedPlaces.sort((a, b) => (a._SCORE || 0) - (b._SCORE || 0)); // Ordenar por placar crescente (melhores leads primeiro)
  }

  /**
   * Suggests services based on the place details using the defined service suggestions.
   *
   * @param place - The place details result from the Google Maps API.
   * @returns An array of suggested service names.
   */
  private suggestServices(place: PlaceDetailsResult): string[] {
    return serviceSuggestions
      .filter((service) => service.condition(place))
      .map((service) => service.name);
  }
}

// Execute the application
(async () => {
  try {
    const mapsService = new GoogleMapsService();
    const placeScorer = new AIPlaceScoreCalculator();
    const qualityAnalyzer = new InformationQualityAnalyzer();
    const app = new PlacesSearchApp(mapsService, placeScorer, qualityAnalyzer);
    await app.run();
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
})();
