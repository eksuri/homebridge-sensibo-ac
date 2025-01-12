let Characteristic

function toFahrenheit(value) {
	return Math.round((value * 1.8) + 32)
}

function characteristicToMode(characteristic) {
	switch (characteristic) {
		case Characteristic.TargetHeaterCoolerState.AUTO:
			return 'AUTO'

		case Characteristic.TargetHeaterCoolerState.COOL:
			return 'COOL'

		case Characteristic.TargetHeaterCoolerState.HEAT:
			return 'HEAT'
	}
}

// TODO: do we need this? Why would 'value' ever be outside correct range?
function sanitize(service, characteristic, value) {
	const minAllowed = service.getCharacteristic(Characteristic[characteristic]).props.minValue
	const maxAllowed = service.getCharacteristic(Characteristic[characteristic]).props.maxValue
	const validValues = service.getCharacteristic(Characteristic[characteristic]).props.validValues
	const currentValue = service.getCharacteristic(Characteristic[characteristic]).value

	if (value !== 0 && (typeof value === 'undefined' || !value)) {
		return currentValue
	}

	if (validValues && !validValues.includes(value)) {
		return currentValue
	}

	if (minAllowed && value < minAllowed) {
		return currentValue
	}

	if (maxAllowed && value > maxAllowed) {
		return currentValue
	}

	return value
}

function updateClimateReact(device, enableClimateReactAutoSetup) {
	if (!enableClimateReactAutoSetup) {
		return
	}

	// If nothing has changed should we skip...? Like we do in StateHandler for SET?

	const smartModeState = device.state.smartMode

	smartModeState.type = 'temperature'
	smartModeState.highTemperatureWebhook = null
	smartModeState.lowTemperatureWebhook = null

	if (device.state.mode === 'COOL') {
		smartModeState.highTemperatureThreshold = device.state.targetTemperature + (device.usesFahrenheit ? 1.8 : 1)
		smartModeState.highTemperatureState = {
			on: true,
			targetTemperature: device.state.targetTemperature,
			temperatureUnit: device.temperatureUnit,
			mode: device.state.mode,
			fanSpeed: device.state.fanSpeed,
			swing: device.state.verticalSwing,
			horizontalSwing: device.state.horizontalSwing,
			light: device.state.light
		}

		smartModeState.lowTemperatureThreshold = device.state.targetTemperature - (device.usesFahrenheit ? 1.8 : 1)
		smartModeState.lowTemperatureState = {
			on: false,
			targetTemperature: device.state.targetTemperature,
			temperatureUnit: device.temperatureUnit,
			mode: device.state.mode,
			fanSpeed: device.state.fanSpeed,
			swing: device.state.verticalSwing,
			horizontalSwing: device.state.horizontalSwing,
			light: device.state.light
		}
	} else if (device.state.mode === 'HEAT') {
		smartModeState.highTemperatureThreshold = device.state.targetTemperature + (device.usesFahrenheit ? 1.8 : 1)
		smartModeState.highTemperatureState = {
			on: false,
			targetTemperature: device.state.targetTemperature,
			temperatureUnit: device.temperatureUnit,
			mode: device.state.mode,
			fanSpeed: device.state.fanSpeed,
			swing: device.state.verticalSwing,
			horizontalSwing: device.state.horizontalSwing,
			light: device.state.light
		}

		smartModeState.lowTemperatureThreshold = device.state.targetTemperature - (device.usesFahrenheit ? 1.8 : 1)
		smartModeState.lowTemperatureState = {
			on: true,
			targetTemperature: device.state.targetTemperature,
			temperatureUnit: device.temperatureUnit,
			mode: device.state.mode,
			fanSpeed: device.state.fanSpeed,
			swing: device.state.verticalSwing,
			horizontalSwing: device.state.horizontalSwing,
			light: device.state.light
		}
	}

	// StateHandler is invoked as a Proxy, and therefore overwrites/intercepts the default get()/set() commands [traps]
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy

	// NOTE: device.state is of "type" StateHandler. When one of its properties is "set" (e.g. device.state.<property> = <val>),
	//       that's where we actually send commands to the appropriate Sensibo devices. If a property is not set, the aformentioned
	//       code will not execute and the changes would not take effect.
	//
	//       For example, if we set a property of smartMode directly, e.g. device.state.smartMode.enabled = true, StateHandler's
	//       setter will not get called and so any changes will not take effect. This is why we MUST update a device's property as
	//       a whole, and do it only once (otherwise's the setter will get called multiple times which will send repeated commands
	//       to the Sensibo devices).
	device.state.smartMode = smartModeState
}

// TODO: perhaps make this a class?
module.exports = (device, platform) => {
	Characteristic = platform.api.hap.Characteristic
	const log = platform.log
	const enableClimateReactAutoSetup = platform.enableClimateReactAutoSetup

	return {

		get: {
			// TODO: refactor this similar to PureActive below?
			ACActive: (callback) => {
				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode === 'FAN' || mode === 'DRY') {
					log.easyDebug(device.name, '(GET) - AC Active State: false')

					callback(null, 0)
				} else {
					log.easyDebug(device.name, '(GET) - AC Active State: true')

					callback(null, 1)
				}
			},

			PureActive: (callback) => {
				const active = device.state.active

				log.easyDebug(`${device.name} (GET) - Pure Active State: ${active}`)

				callback(null, active ? 1 : 0)
			},

			CurrentAirPurifierState: (callback) => {
				const active = device.state.active

				log.easyDebug(`${device.name} (GET) - Pure Current State: ${active ? 'PURIFYING_AIR' : 'INACTIVE'}`)

				callback(null, active ? 2 : 0)
			},

			TargetAirPurifierState: (callback) => {
				const pureBoost = device.state.pureBoost

				log.easyDebug(`${device.name} (GET) - Pure Target State (Boost): ${pureBoost ? 'AUTO' : 'MANUAL'}`)

				callback(null, pureBoost ? 1 : 0)
			},

			CurrentHeaterCoolerState: (callback) => {
				const active = device.state.active
				const mode = device.state.mode
				const targetTemp = device.state.targetTemperature
				const currentTemp = device.state.currentTemperature

				log.easyDebug(device.name, '(GET) - Current HeaterCooler State:', active ? mode : 'OFF')

				if (!active || mode === 'FAN' || mode === 'DRY') {
					callback(null, Characteristic.CurrentHeaterCoolerState.INACTIVE)
				} else if (mode === 'COOL') {
					callback(null, Characteristic.CurrentHeaterCoolerState.COOLING)
				} else if (mode === 'HEAT') {
					callback(null, Characteristic.CurrentHeaterCoolerState.HEATING)
				} else if (currentTemp > targetTemp) {
					callback(null, Characteristic.CurrentHeaterCoolerState.COOLING)
				} else {
					callback(null, Characteristic.CurrentHeaterCoolerState.HEATING)
				}
			},

			TargetHeaterCoolerState: (callback) => {
				const active = device.state.active
				const mode = device.state.mode

				log.easyDebug(device.name, '(GET) - Target HeaterCooler State:', active ? mode : 'OFF')
				if (!active || mode === 'FAN' || mode === 'DRY') {
					const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value

					callback(null, lastMode)
				} else {
					callback(null, sanitize(device.HeaterCoolerService, 'TargetHeaterCoolerState', Characteristic.TargetHeaterCoolerState[mode]))
				}
			},

			CurrentTemperature: (callback) => {
				const currentTemp = device.state.currentTemperature

				if (device.usesFahrenheit) {
					log.easyDebug(device.name, '(GET) - Current Temperature:', toFahrenheit(currentTemp) + 'ºF')
				} else {
					log.easyDebug(device.name, '(GET) - Current Temperature:', currentTemp + 'ºC')
				}

				callback(null, currentTemp)
			},

			CoolingThresholdTemperature: (callback) => {
				const targetTemp = sanitize(device.HeaterCoolerService, 'CoolingThresholdTemperature', device.state.targetTemperature)

				if (device.usesFahrenheit) {
					log.easyDebug(device.name, '(GET) - Target Cooling Temperature:', toFahrenheit(targetTemp) + 'ºF')
				} else {
					log.easyDebug(device.name, '(GET) - Target Cooling Temperature:', targetTemp + 'ºC')
				}

				callback(null, targetTemp)
			},

			HeatingThresholdTemperature: (callback) => {
				const targetTemp = sanitize(device.HeaterCoolerService, 'HeatingThresholdTemperature', device.state.targetTemperature)

				if (device.usesFahrenheit) {
					log.easyDebug(device.name, '(GET) - Target Heating Temperature:', toFahrenheit(targetTemp) + 'ºF')
				} else {
					log.easyDebug(device.name, '(GET) - Target Heating Temperature:', targetTemp + 'ºC')
				}

				callback(null, targetTemp)
			},

			TemperatureDisplayUnits: (callback) => {
				log.easyDebug(device.name, '(GET) - Temperature Display Units:', device.temperatureUnit)

				callback(null, device.usesFahrenheit ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS)
			},

			CurrentRelativeHumidity: (callback) => {
				log.easyDebug(device.name, '(GET) - Current Relative Humidity:', device.state.relativeHumidity, '%')

				callback(null, device.state.relativeHumidity)
			},

			ACSwing: (callback) => {
				const swing = device.state.verticalSwing

				log.easyDebug(device.name, '(GET) - AC Swing:', swing)

				callback(null, Characteristic.SwingMode[swing])
			},

			ACRotationSpeed: (callback) => {
				const fanSpeed = device.state.fanSpeed ?? 0

				log.easyDebug(device.name, '(GET) - AC Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			PureRotationSpeed: (callback) => {
				const fanSpeed = device.state.fanSpeed

				log.easyDebug(device.name, '(GET) - Pure Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			// FILTER
			FilterChangeIndication: (callback) => {
				const filterChange = device.state.filterChange

				log.easyDebug(device.name, '(GET) - Filter Change Indication:', filterChange)

				callback(null, Characteristic.FilterChangeIndication[filterChange])
			},

			FilterLifeLevel: (callback) => {
				const filterLifeLevel = device.state.filterLifeLevel

				log.easyDebug(device.name, '(GET) - Filter Life Level:', filterLifeLevel + '%')

				callback(null, filterLifeLevel)
			},

			// FAN
			FanActive: (callback) => {
				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'FAN') {
					log.easyDebug(device.name, '(GET) - Fan Active State: false')

					callback(null, 0)
				} else {
					log.easyDebug(device.name, '(GET) - Fan Active State: true')

					callback(null, 1)
				}
			},

			FanSwing: (callback) => {
				const swing = device.state.verticalSwing

				log.easyDebug(device.name, '(GET) - Fan Swing:', swing)

				callback(null, Characteristic.SwingMode[swing])
			},

			FanRotationSpeed: (callback) => {
				const fanSpeed = device.state.fanSpeed

				log.easyDebug(device.name, '(GET) - Fan Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			// DEHUMIDIFIER
			DryActive: (callback) => {
				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'DRY') {
					log.easyDebug(device.name, '(GET) - Dry Active State: false')

					callback(null, 0)
				} else {
					log.easyDebug(device.name, '(GET) - Dry Active State: true')

					callback(null, 1)
				}
			},

			CurrentHumidifierDehumidifierState: (callback) => {
				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'DRY') {
					log.easyDebug(device.name, '(GET) - Dry Current Dehumidifier State: INACTIVE')

					callback(null, Characteristic.CurrentHumidifierDehumidifierState.INACTIVE)
				} else {
					log.easyDebug(device.name, '(GET) - Dry Current Dehumidifier State: DEHUMIDIFYING')

					callback(null, Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING)
				}
			},

			TargetHumidifierDehumidifierState: (callback) => {
				log.easyDebug(device.name, '(GET) - Target Dehumidifier State: DEHUMIDIFIER')

				callback(null, Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER)
			},

			DryRotationSpeed: (callback) => {
				const fanSpeed = device.state.fanSpeed

				log.easyDebug(device.name, '(GET) - Dry Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			DrySwing: (callback) => {
				const swing = device.state.verticalSwing

				log.easyDebug(device.name, '(GET) - Dry Swing:', swing)

				callback(null, Characteristic.SwingMode[swing])
			},

			// ROOM SENSOR
			MotionDetected: (callback) => {
				const motionDetected = device.state.motionDetected

				log.easyDebug(device.name, '(GET) - Motion Detected:', motionDetected)

				callback(null, motionDetected)
			},

			StatusLowBattery: (callback) => {
				const lowBattery = device.state.lowBattery

				log.easyDebug(device.name, '(GET) - Status Low Battery:', lowBattery)

				callback(null, Characteristic.StatusLowBattery[lowBattery])
			},

			// HORIZONTAL SWING
			HorizontalSwing: (callback) => {
				const horizontalSwing = device.state.horizontalSwing

				log.easyDebug(device.name, '(GET) - Horizontal Swing:', horizontalSwing)

				callback(null, horizontalSwing === 'SWING_ENABLED')
			},

			// AIR CONDITIONER/PURIFIER LIGHT
			LightSwitch: (callback) => {
				const light = device.state.light

				log.easyDebug(device.name, '(GET) - Light:', light ? 'ON' : 'OFF')

				callback(null, light)
			},

			// CLIMATE REACT
			ClimateReactSwitch: (callback) => {
				const smartModeEnabled = device.state.smartMode.enabled

				log.easyDebug(device.name, '(GET) - Climate React Enabled Switch:', smartModeEnabled)

				callback(null, smartModeEnabled)
			},

			// OCCUPANCY SENSOR
			OccupancyDetected: (callback) => {
				const occupancy = device.state.occupancy

				log.easyDebug(device.name, '(GET) Occupancy Detected:', occupancy)

				callback(null, Characteristic.OccupancyDetected[occupancy])
			},

			// Air Quality
			AirQuality: (callback) => {
				const airQuality = device.state.airQuality

				log.easyDebug(device.name, '(GET) - Air Quality:', airQuality)

				callback(null, airQuality)
			},

			VOCDensity: (callback) => {
				const VOCDensity = device.state.VOCDensity

				log.easyDebug(device.name, '(GET) - Volatile Organic Compound Density:', VOCDensity)

				callback(null, VOCDensity)
			},

			CarbonDioxideDetected: (callback) => {
				const carbonDioxideDetected = device.state.carbonDioxideDetected

				log.easyDebug(device.name, '(GET) - Carbon Dioxide Detected:', carbonDioxideDetected)

				callback(null, carbonDioxideDetected)
			},

			CarbonDioxideLevel: (callback) => {
				const carbonDioxideLevel = device.state.carbonDioxideLevel

				log.easyDebug(device.name, '(GET) - Carbon Dioxide Level:', carbonDioxideLevel)

				callback(null, carbonDioxideLevel)
			},

			SyncButton: (callback) => {
				log.easyDebug(device.name, '(GET) - Sync Button, no state change')

				callback(null, false)
			}
		},

		set: {
			ACActive: (state, callback) => {
				state = !!state
				log.easyDebug(device.name, '(SET) - AC Active State:', state)

				if (state) {
					device.state.active = true
					const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value
					const mode = characteristicToMode(lastMode)

					log.easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
					device.state.mode = mode
				} else if (device.state.mode === 'COOL' || device.state.mode === 'HEAT' || device.state.mode === 'AUTO') {
					device.state.active = false
				}

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			PureActive: (state, callback) => {
				state = !!state
				log.easyDebug(device.name, '(SET) - Pure Active State:', state)
				device.state.active = state

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			TargetHeaterCoolerState: (state, callback) => {
				const mode = characteristicToMode(state)

				log.easyDebug(device.name, '(SET) - Target HeaterCooler State:', mode)
				device.state.mode = mode
				device.state.active = true

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			CoolingThresholdTemperature: (targetTemp, callback) => {
				if (device.usesFahrenheit) {
					log.easyDebug(device.name, '(SET) - Target Cooling Temperature:', toFahrenheit(targetTemp) + 'ºF')
				} else {
					log.easyDebug(device.name, '(SET) - Target Cooling Temperature:', targetTemp + 'ºC')
				}

				const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value
				const mode = characteristicToMode(lastMode)

				device.state.targetTemperature = targetTemp
				// TODO: do we need the below? Does it turn the unit on if it's currently off?
				log.easyDebug(device.name, '(SET) - Target HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			HeatingThresholdTemperature: (targetTemp, callback) => {
				if (device.usesFahrenheit) {
					log.easyDebug(device.name, '(SET) - Target Heating Temperature:', toFahrenheit(targetTemp) + 'ºF')
				} else {
					log.easyDebug(device.name, '(SET) - Target Heating Temperature:', targetTemp + 'ºC')
				}

				const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value
				const mode = characteristicToMode(lastMode)

				device.state.targetTemperature = targetTemp
				log.easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			ACSwing: (state, callback) => {
				state = state === Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				log.easyDebug(device.name, '(SET) - AC Swing:', state)
				device.state.verticalSwing = state

				const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value
				const mode = characteristicToMode(lastMode)

				log.easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			ACRotationSpeed: (speed, callback) => {
				log.easyDebug(device.name, '(SET) - AC Rotation Speed:', speed + '%')
				device.state.fanSpeed = speed

				const lastMode = device.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState).value
				const mode = characteristicToMode(lastMode)

				log.easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			PureRotationSpeed: (speed, callback) => {
				if (speed) {
					log.easyDebug(device.name, '(SET) - Pure Rotation Speed:', speed + '%')
					device.state.fanSpeed = speed
					device.state.active = true
				} else {
					device.state.active = false
				}

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			// FILTER
			ResetFilterIndication: (value, callback) => {
				log.easyDebug(device.name, '(SET) - Filter Change Indication: RESET')
				device.state.filterChange = 0
				device.state.filterLifeLevel = 100

				callback()
			},

			// FAN
			FanActive: (state, callback) => {
				state = !!state
				log.easyDebug(device.name, '(SET) - Fan state Active:', state)

				if (state) {
					log.easyDebug(device.name, '(SET) - Mode to: FAN')
					device.state.mode = 'FAN'

					device.state.active = true
				} else if (device.state.mode === 'FAN') {
					device.state.active = false
				}

				callback()
			},

			FanSwing: (state, callback) => {
				state = state === Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				log.easyDebug(device.name, '(SET) - Fan Swing:', state)
				device.state.verticalSwing = state
				device.state.active = true
				log.easyDebug(device.name, '(SET) - Mode to: FAN')
				device.state.mode = 'FAN'

				callback()
			},

			FanRotationSpeed: (speed, callback) => {
				log.easyDebug(device.name, '(SET) - Fan Rotation Speed:', speed + '%')
				device.state.fanSpeed = speed

				device.state.active = true
				log.easyDebug(device.name, '(SET) - Mode to: FAN')
				device.state.mode = 'FAN'

				callback()
			},

			// DEHUMIDIFIER
			DryActive: (state, callback) => {
				state = !!state
				log.easyDebug(device.name, '(SET) - Dry state Active:', state)
				if (state) {
					device.state.active = true
					log.easyDebug(device.name, '(SET) - HeaterCooler State: DRY')
					device.state.mode = 'DRY'
				} else if (device.state.mode === 'DRY') {
					device.state.active = false
				}

				callback()
			},

			TargetHumidifierDehumidifierState: (state, callback) => {
				device.state.active = true
				log.easyDebug(device.name, '(SET) - HeaterCooler State: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			DrySwing: (state, callback) => {
				state = state === Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				log.easyDebug(device.name, '(SET) - Dry Swing:', state)
				device.state.verticalSwing = state

				device.state.active = true
				log.easyDebug(device.name + ' -> Setting Mode to: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			DryRotationSpeed: (speed, callback) => {
				log.easyDebug(device.name, '(SET) - Dry Rotation Speed:', speed + '%')
				device.state.fanSpeed = speed

				device.state.active = true
				log.easyDebug(device.name + ' -> Setting Mode to: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			// HORIZONTAL SWING
			HorizontalSwing: (state, callback) => {
				state = state ? 'SWING_ENABLED' : 'SWING_DISABLED'
				log.easyDebug(device.name, '(SET) - Horizontal Swing Swing:', state)
				device.state.horizontalSwing = state

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			// AIR CONDITIONER/PURIFIER LIGHT
			LightSwitch: (state, callback) => {
				log.easyDebug(device.name, '(SET) - Light to', state ? 'ON' : 'OFF')
				device.state.light = state

				updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			// AC SYNC BUTTON
			// TODO: should be moved to be a 'set' in StateHanlder line 33
			SyncButton: (state, callback) => {
				if (state) {
					log.easyDebug(device.name, '(SYNC) - AC Active State:', device.state.active)
					device.state.syncState()
				}

				callback()
			},

			// CLIMATE REACT
			ClimateReactSwitch: (state, callback) => {
				log.easyDebug(device.name, '(SET) - Climate React Enabled Switch:', state)
				const smartModeState = device.state.smartMode

				smartModeState.enabled = !!state

				// NOTE: we must set the 'smartMode' property directly (and NOT for example like so: device.state.smartMode.enabled = true),
				//       otherwise the StateHandler's setter code will not be executed and any changes will not take effect.
				device.state.smartMode = smartModeState

				callback()
			},

			// PURE BOOST
			TargetAirPurifierState: (state, callback) => {
				const pureBoost = !!state

				log.easyDebug(device.name, '(SET) - Pure Target State (Boost):', pureBoost ? 'AUTO' : 'MANUAL')
				device.state.pureBoost = pureBoost

				callback()
			}
		}

	}
}