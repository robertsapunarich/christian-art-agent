// src/index.ts
import { Agent, AgentNamespace, routeAgentRequest } from 'agents-sdk';

import { Ai } from '@cloudflare/ai';
import puppeteer from '@cloudflare/puppeteer';

// Define our state interface
interface ArtAgentState {
	currentQuery?: string;
	searchResults?: ArtworkInfo[];
	selectedWorks?: AnnotatedArtwork[];
	processingStage?: 'idle' | 'analyzing' | 'researching' | 'fetching' | 'annotating' | 'complete' | 'error';
	error?: string;
	lastUpdated?: string;
}

// Define artwork-related interfaces
interface ArtworkInfo {
	id: string;
	title: string;
	artist: string;
	year: number;
	period: string;
	location: string;
	relevanceScore?: number;
}

interface ArtworkWithImage extends ArtworkInfo {
	imageUrl: string;
}

interface AnnotatedArtwork extends ArtworkWithImage {
	annotations: {
		historicalContext: string;
		artisticStyle: string;
		biblicalNarrative: string;
		interestingDetails: string[];
		uniqueInterpretation: string;
	};
}

// Define our environment with bindings
interface Env {
	// Agent namespace binding
	CHRISTIAN_ART_AGENT: AgentNamespace<ChristianArtAgent>;

	// Workers AI binding
	AI: any;

	// Browser Rendering API for searching images
	BROWSER: Fetcher;

	// Optional: KV namespace for caching results
	ART_CACHE: KVNamespace;
}

export class ChristianArtAgent extends Agent<Env, ArtAgentState> {
	/**
	 * Handle HTTP requests to the agent
	 */
	async onRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Handle query submission
		if (url.pathname.endsWith('/query') && request.method === 'POST') {
			try {
				const data = await request.json();
				const { query } = data;

				if (!query) {
					return Response.json({ error: 'No query provided' }, { status: 400 });
				}

				// Check if we have cached results
				if (this.env.ART_CACHE) {
					try {
						const cachedResult = await this.env.ART_CACHE.get(`query:${query}`);
						if (cachedResult) {
							const parsedResult = JSON.parse(cachedResult);

							// Update state with cached results
							this.setState({
								currentQuery: query,
								selectedWorks: parsedResult.artworks,
								processingStage: 'complete',
								lastUpdated: new Date().toISOString(),
							});

							return Response.json({
								message: 'Query results retrieved from cache',
								queryId: crypto.randomUUID(),
								cached: true,
							});
						}
					} catch (error) {
						console.error('Error checking cache:', error);
						// Continue with processing if cache fails
					}
				}

				// Update agent state
				this.setState({
					currentQuery: query,
					processingStage: 'analyzing',
					lastUpdated: new Date().toISOString(),
				});

				// Schedule the query processing
				await this.schedule(0, 'processArtQuery', { query });

				return Response.json({
					message: 'Query received and processing started',
					queryId: crypto.randomUUID(),
				});
			} catch (error) {
				console.error('Error processing query:', error);
				return Response.json({ error: 'Failed to process query' }, { status: 500 });
			}
		}

		// Handle status checks
		if (url.pathname.endsWith('/status')) {
			return Response.json({
				state: this.state.processingStage || 'idle',
				lastUpdated: this.state.lastUpdated,
				query: this.state.currentQuery,
				error: this.state.error,
			});
		}

		// Handle results retrieval
		if (url.pathname.endsWith('/results')) {
			if (this.state.processingStage !== 'complete') {
				return Response.json({
					message: 'Results not ready yet',
					state: this.state.processingStage || 'idle',
					error: this.state.error,
				});
			}

			return Response.json({
				query: this.state.currentQuery,
				artworks: this.state.selectedWorks,
			});
		}

		// Default response
		return Response.json({
			message: 'Christian Art History AI Agent',
			endpoints: ['/query', '/status', '/results'],
		});
	}

	/**
	 * Process a biblical art query
	 */
	async processArtQuery(data: { query: string }) {
		try {
			// 1. Research artworks related to the biblical narrative
			const artworksList = await this.researchArtworks(data.query);

			// 2. For each artwork, fetch an image
			const artworksWithImages = await this.fetchArtworkImages(artworksList);

			// 3. Generate detailed annotations for each artwork
			const annotatedArtworks = await this.annotateArtworks(artworksWithImages, data.query);

			// 4. Update state with the results
			this.setState({
				...this.state,
				selectedWorks: annotatedArtworks,
				processingStage: 'complete',
				lastUpdated: new Date().toISOString(),
			});

			// 5. Cache the results if KV is available
			if (this.env.ART_CACHE && annotatedArtworks.length > 0) {
				try {
					await this.env.ART_CACHE.put(
						`query:${data.query}`,
						JSON.stringify({ artworks: annotatedArtworks }),
						{ expirationTtl: 60 * 60 * 24 * 30 } // Cache for 30 days
					);
				} catch (error) {
					console.error('Error caching results:', error);
				}
			}
		} catch (error) {
			console.error('Error in art query processing:', error);
			this.setState({
				...this.state,
				processingStage: 'error',
				error: error instanceof Error ? error.message : 'Unknown error occurred',
				lastUpdated: new Date().toISOString(),
			});
		}
	}

	/**
	 * Research artworks related to the biblical narrative
	 */
	async researchArtworks(biblicalNarrative: string): Promise<ArtworkInfo[]> {
		this.setState({
			...this.state,
			processingStage: 'researching',
			lastUpdated: new Date().toISOString(),
		});

		// Use Llama 3 to research artworks related to this narrative
		const ai = new Ai(this.env.AI);

		const prompt = `
      I need a list of 5 significant artworks that depict the biblical narrative of "${biblicalNarrative}".
      For each artwork, provide:
      1. Title of the artwork
      2. Artist name
      3. Year created (approximate if necessary)
      4. Art period or style
      5. Current location (museum or collection)

      FORMAT AS JSON that matches this structure:
      [
        {
          "title": "Title of the Artwork",
          "artist": "Artist Name",
          "year": 1500,
          "period": "Renaissance",
          "location": "The Louvre, Paris"
        }
      ]

      Include only well-known, historically significant works with reliable information.
      Make sure all entries are properly formatted as a valid JSON array.
    `;

		try {
			const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
				messages: [
					{
						role: 'system',
						content:
							'You are an art history expert specializing in Christian art. Provide accurate information about artworks depicting biblical narratives.',
					},
					{ role: 'user', content: prompt },
				],
			});

			// Parse the response to extract JSON
			const jsonMatch = response.response.match(/\[\s*\{.*\}\s*\]/s);
			if (!jsonMatch) {
				throw new Error('Failed to extract JSON list of artworks from AI response');
			}

			const artworksJson = jsonMatch[0];
			const artworks = JSON.parse(artworksJson);

			// Add IDs to the artworks
			return artworks.map((artwork: any, index: number) => ({
				id: `artwork-${Date.now()}-${index}`,
				title: artwork.title,
				artist: artwork.artist,
				year: artwork.year || 0,
				period: artwork.period || 'Unknown',
				location: artwork.location || 'Unknown',
			}));
		} catch (error) {
			console.error('Error researching artworks:', error);
			throw new Error('Failed to research artworks for the biblical narrative');
		}
	}

	/**
	 * Fetch images for the researched artworks
	 */
	async fetchArtworkImages(artworks: ArtworkInfo[]): Promise<ArtworkWithImage[]> {
		this.setState({
			...this.state,
			processingStage: 'fetching',
			lastUpdated: new Date().toISOString(),
		});

		// Use Browser Rendering API to search for images
		const browser = await puppeteer.launch(this.env.BROWSER);
		const artworksWithImages: ArtworkWithImage[] = [];

		try {
			for (const artwork of artworks) {
				try {
					const page = await browser.newPage();
					const searchQuery = `${artwork.artist} ${artwork.title} painting artwork`;

					// Navigate to a search engine
					await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`, {
						waitUntil: 'networkidle2',
					});

					// Wait for images to load
					await page.waitForSelector('img');

					// Extract image URL from first result
					const imageUrl = await page.evaluate(() => {
						// Target the actual image results
						const imgElements = Array.from(document.querySelectorAll('img')).filter(
							(img) => img.src && img.src.startsWith('http') && img.width > 100 && img.height > 100
						);

						return imgElements.length > 0 ? imgElements[1].src : null;
					});

					if (imageUrl) {
						artworksWithImages.push({
							...artwork,
							imageUrl,
						});
					} else {
						// If no image found, use a placeholder
						artworksWithImages.push({
							...artwork,
							imageUrl: `https://placekitten.com/600/400?text=${encodeURIComponent(artwork.title)}`,
						});
					}

					await page.close();
				} catch (error) {
					console.error(`Error fetching image for ${artwork.title}:`, error);
					// Add artwork with placeholder image on error
					artworksWithImages.push({
						...artwork,
						imageUrl: `https://placekitten.com/600/400?text=${encodeURIComponent(artwork.title)}`,
					});
				}
			}
		} finally {
			await browser.close();
		}

		return artworksWithImages;
	}

	/**
	 * Generate detailed annotations for the artworks
	 */
	async annotateArtworks(artworks: ArtworkWithImage[], biblicalNarrative: string): Promise<AnnotatedArtwork[]> {
		this.setState({
			...this.state,
			processingStage: 'annotating',
			lastUpdated: new Date().toISOString(),
		});

		const ai = new Ai(this.env.AI);
		const annotatedWorks: AnnotatedArtwork[] = [];

		for (const artwork of artworks) {
			try {
				const prompt = `
          Create detailed educational annotations for the artwork:
          "${artwork.title}" by ${artwork.artist} (${artwork.year}), from the ${artwork.period} period.
          This artwork depicts the biblical narrative of ${biblicalNarrative}.

          Provide the following information in a structured way:
          1. Historical context of when this was created
          2. Analysis of the artistic style and significance
          3. Explanation of how this interprets the biblical narrative
          4. Five interesting details to notice in the painting
          5. What makes this artwork's interpretation unique compared to other depictions

          FORMAT AS JSON with these keys:
          {
            "historicalContext": "text describing historical context",
            "artisticStyle": "text describing artistic style",
            "biblicalNarrative": "text explaining biblical narrative interpretation",
            "interestingDetails": ["detail 1", "detail 2", "detail 3", "detail 4", "detail 5"],
            "uniqueInterpretation": "text explaining unique aspects"
          }

          Ensure your response is properly formatted as valid JSON.
        `;

				const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
					messages: [
						{ role: 'system', content: 'You are an expert art historian specializing in Christian art.' },
						{ role: 'user', content: prompt },
					],
				});

				// Extract and parse JSON from response
				const jsonMatch = response.response.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					throw new Error(`Failed to extract JSON annotations for ${artwork.title}`);
				}

				const annotationsJson = jsonMatch[0];
				const annotations = JSON.parse(annotationsJson);

				annotatedWorks.push({
					...artwork,
					annotations: {
						historicalContext: annotations.historicalContext || 'Historical context information unavailable',
						artisticStyle: annotations.artisticStyle || 'Artistic style information unavailable',
						biblicalNarrative: annotations.biblicalNarrative || 'Biblical narrative interpretation unavailable',
						interestingDetails: annotations.interestingDetails || ['Detail information unavailable'],
						uniqueInterpretation: annotations.uniqueInterpretation || 'Unique interpretation information unavailable',
					},
				});
			} catch (error) {
				console.error(`Error annotating ${artwork.title}:`, error);

				// Add with default annotations on error
				annotatedWorks.push({
					...artwork,
					annotations: {
						historicalContext: 'Information could not be generated at this time.',
						artisticStyle: 'Information could not be generated at this time.',
						biblicalNarrative: 'Information could not be generated at this time.',
						interestingDetails: ['Information could not be generated at this time.'],
						uniqueInterpretation: 'Information could not be generated at this time.',
					},
				});
			}
		}

		return annotatedWorks;
	}

	/**
	 * WebSocket connection handler
	 */
	async onConnect(connection) {
		connection.accept();

		// Send initial state
		connection.send(
			JSON.stringify({
				type: 'state',
				data: {
					processingStage: this.state.processingStage || 'idle',
					query: this.state.currentQuery,
					error: this.state.error,
				},
			})
		);

		// If processing is complete, send results
		if (this.state.processingStage === 'complete' && this.state.selectedWorks) {
			connection.send(
				JSON.stringify({
					type: 'results',
					data: {
						query: this.state.currentQuery,
						artworks: this.state.selectedWorks,
					},
				})
			);
		}
	}

	/**
	 * WebSocket message handler
	 */
	async onMessage(connection, message) {
		try {
			const data = JSON.parse(message);

			if (data.type === 'query') {
				// Set initial state
				this.setState({
					currentQuery: data.query,
					processingStage: 'analyzing',
					lastUpdated: new Date().toISOString(),
				});

				// Update client
				connection.send(
					JSON.stringify({
						type: 'state',
						data: {
							processingStage: 'analyzing',
							query: data.query,
						},
					})
				);

				// Schedule the query processing
				await this.schedule(0, 'processArtQuery', { query: data.query });
			}
		} catch (error) {
			console.error('Error handling WebSocket message:', error);
			connection.send(
				JSON.stringify({
					type: 'error',
					data: {
						message: 'Failed to process message',
						error: error instanceof Error ? error.message : 'Unknown error',
					},
				})
			);
		}
	}

	/**
	 * State update handler
	 */
	onStateUpdate(state, source) {
		console.log(`State updated (${source}):`, state.processingStage);

		// Notify all connected WebSockets about state change
		const connections = this.ctx.getWebSockets();
		for (const connection of connections) {
			connection.send(
				JSON.stringify({
					type: 'state',
					data: {
						processingStage: state.processingStage,
						lastUpdated: state.lastUpdated,
						error: state.error,
					},
				})
			);

			// If processing is complete, send results
			if (state.processingStage === 'complete' && state.selectedWorks) {
				connection.send(
					JSON.stringify({
						type: 'results',
						data: {
							query: state.currentQuery,
							artworks: state.selectedWorks,
						},
					})
				);
			}
		}
	}
}

// Handle incoming requests and route to appropriate agent
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Route the request to the appropriate agent
		return (await routeAgentRequest(request, env)) || new Response('Not Found', { status: 404 });
	},
};
